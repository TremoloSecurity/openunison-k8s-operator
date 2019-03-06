//Global Vars
var inProp = {};
var CertUtils = Java.type("com.tremolosecurity.kubernetes.artifacts.util.CertUtils");
var cfg_ob = {};
var k8s_obj = {};

//Helper Functions
/*
 Create properties map from the non-secret portion of the CR
*/
function props_from_crd(cr) {
    props = {};

    for (i=0;i<cr.non_secret_data.length;i++) {
        props[cr.non_secret_data[i].name] = cr.non_secret_data[i].value;
    }

    return props;

}

/*
  Updates properties with values from the source secret
*/
function props_from_secret(cr,inProps) {
    results = k8s.callWS("/api/v1/namespaces/" + k8s_namespace + "/secrets/" + cr.source_secret);
    if (results.code == 200) {
        secret = JSON.parse(results.data);
        for (i=0;i<cr.secret_data.length;i++) {
            for (var property in secret.data) {
                if (secret.data.hasOwnProperty(property)) {
                    if (property === cr.secret_data[i]) {
                        inProps[cr.secret_data[i]] = new java.lang.String(java.util.Base64.getDecoder().decode(secret.data[property])).trim();
                    }
                }
            }

           
        }
    } else {
        return;
    }
}

/*
    checks if a value is a "script" 
*/
function script_val(cfg_option) {
    cfg_option_val = cfg_option;
    if (cfg_option_val.startsWith('${')) {
        cfg_option_val_script = cfg_option_val.substring(2,cfg_option_val.length - 1);
        cfg_option_val = js.eval(cfg_option_val_script);
    }

    return cfg_option_val;
}

/*
Process a key pair configuration
*/
function process_key_pair_config(cfg_obj,key_config,ouKs,ksPassword) {
    print("\n\nProcessing key '" + key_config.name + "'");
    create_keypair_template = cfg_obj.key_store.key_pairs.create_keypair_template;

    //determine the namespace of the secret
    target_ns = k8s_namespace;
    if (key_config.create_data.target_namespace != null && key_config.create_data.target_namespace !== "") {
        target_ns = key_config.create_data.target_namespace;
    }

    //check if the secret already exists
    print("Checking if kubernetes secret exists")
    secret_response = k8s.callWS("/api/v1/namespaces/" + target_ns + "/secrets/" + key_config.name,"",-1);
    secret_exists = false;

    if (secret_response.code == 200) {
        print("Secret exists")
        secret_json = JSON.parse(secret_response.data);
        if (! key_config.replace_if_exists) {
            print("Adding existing secret to keystore");
            //TODO - add key to keystore

            return;
        } else {
            if (secret_json.metadata.labels.tremolo_operator_created != null) {
                print("Adding existing secret to keystore");
                //TODO - add key to keystore

                return;
            }
        }

        secret_exists = true;
    }

    print("Creating keypair");

    //time to create the keypair
    //process the create template and the ca cert flag
    certInfo = {};
    for (var i=0;i<create_keypair_template.length;i++) {
        certInfo[create_keypair_template[i].name] = create_keypair_template[i].value;
    }
    certInfo["caCert"] = key_config.create_data.ca_cert;
    certInfo["size"] = key_config.create_data.key_size;
    
    //figure out the server name/cn and subject alternative names
    server_name = script_val(key_config.create_data.server_name);
    certInfo["serverName"] = server_name;

    if (key_config.create_data.subject_alternative_names != null && key_config.create_data.subject_alternative_names.length > 0) {
        certInfo["subjectAlternativeNames"] = [];
        for (i=0;i<key_config.create_data.subject_alternative_names.length;i++) {
            certInfo["subjectAlternativeNames"].push(script_val(key_config.create_data.subject_alternative_names[i]));
        }
    }


    x509data = CertUtils.createCertificate(certInfo);

    if (key_config.create_data.sign_by_k8s_ca) {
        print("Signing by Kubernetes' CA");
        csrReq = {
            "apiVersion": "certificates.k8s.io/v1beta1",
            "kind": "CertificateSigningRequest",
            "metadata": {
              "name": server_name,
            },
            "spec": {
              "request": java.util.Base64.getEncoder().encodeToString(CertUtils.generateCSR(x509data).getBytes("utf-8")),
              "usages": [
                "digital signature",
                "key encipherment",
                "server auth"
              ]
            }
        };

        print("Posting CSR");
        apiResp = k8s.postWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests',JSON.stringify(csrReq));

        if (apiResp.code == 409) {
            print("CertManager is not enabled on this cluster.  Change sign_by_k8s_cluster to false");
            exit(1);
        }

        approveReq = JSON.parse(apiResp.data);
        approveReq.status.conditions = [
            {
                "type":"Approved",
                "reason":"OpenUnison Deployment",
                "message":"This CSR was approved by the OpenUnison operator"
            }
        ];

        print("Approving CSR");
        apiResp = k8s.putWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests/' + server_name + '/approval',JSON.stringify(approveReq));
        
        print("Retrieving signed certificate");
        apiResp = k8s.callWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests/' + server_name);

        certResp = JSON.parse(apiResp.data);
        b64cert = certResp.status.certificate;

        if (b64cert == null || b64cert === "") {
            print("CertManager is not enabled on this cluster.  Change sign_by_k8s_cluster to false");
            exit(1);
        }

        CertUtils.importSignedCert(x509data,b64cert);

        


    }

    //create tls secret
    print("Creating secret");
    secret_info = key_config.create_data.secret_info;

    if (secret_info == null) {
        secret_info = {};
        secret_info['type_of_secret'] = 'kubernetes.io/tls';
        secret_info['cert_name'] = 'tls.crt';
        secret_info['key_name'] = 'tls.key';
    }

    secret_to_create = {
        "apiVersion":"v1",
        "kind":"Secret",
        "type":secret_info.type_of_secret,
        "metadata": {
            "name": key_config.name,
            "namespace": target_ns
        },
        "data":{
            
        }
    };

    secret_to_create.data[ secret_info.cert_name ] = java.util.Base64.getEncoder().encodeToString(CertUtils.exportCert(x509data.getCertificate()).getBytes("UTF-8"));
    secret_to_create.data[ secret_info.key_name ] = java.util.Base64.getEncoder().encodeToString(CertUtils.exportKey(x509data.getKeyData().getPrivate()).getBytes("UTF-8"));


    if (secret_exists) {
        print("Deleting existing secret");
        k8s.deleteWS("/api/v1/namespaces/" + target_ns + "/secrets/" + key_config.name);
    }

    print("Posting secret");
    k8s.postWS('/api/v1/namespaces/' + target_ns + '/secrets',JSON.stringify(secret_to_create));

    print("Storing to keystore");
    CertUtils.saveX509ToKeystore(ouKs,ksPassword,key_config.name,x509data);
    print("Key '" + key_config.name + "' finished");





}

//Called by controller
function on_watch(k8s_event) {
    print("in js : "  + k8s_event);
    event_json = JSON.parse(k8s_event);
    if (event_json["type"] === "ADDED") {
        k8s_obj = event_json['object'];
        cfg_obj = k8s_obj['spec'];
        inProp = props_from_crd(cfg_obj);
        print(inProp["AD_BASE_DN"]);
        props_from_secret(cfg_obj,inProp);
        print("'" + inProp.unisonKeyStorePassword + "'");

        

        print("Creating openunison keystore");

        ksPassword = new java.lang.String(inProp['unisonKeystorePassword']);
        ouKs = Java.type("java.security.KeyStore").getInstance("PKCS12");
        ouKs.load(null,ksPassword.toCharArray());

        use_k8s_cm = inProp['USE_K8S_CM'] == "true";

        print("Storing k8s certificate");
        ouKs.setCertificateEntry('k8s-master',k8s.getCertificate('k8s-master'));

        print("Storing trusted certificates");
        for (i=0;i<cfg_obj.key_store.trusted_certificates.length;i++) {
            CertUtils.importCertificate(ouKs,ksPassword,cfg_obj.key_store.trusted_certificates[i].name,cfg_obj.key_store.trusted_certificates[i].pem_data);
        }

        print("Processing keypairs");
        
        print("Number of keys : '" + cfg_obj.key_store.key_pairs.keys.length + "'");
        
        for (var i=0;i<cfg_obj.key_store.key_pairs.keys.length;i++) {
            print(i);
            key_config = cfg_obj.key_store.key_pairs.keys[i];
            process_key_pair_config(cfg_obj,key_config,ouKs,ksPassword);
            print(i);
        }

        print("Done");


    } else if (event_json["type"] === "MODIFIED") {

    } else if (event_json["type"] === "DELETED") {

    }
}