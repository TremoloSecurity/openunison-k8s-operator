var CertUtils = Java.type("com.tremolosecurity.kubernetes.artifacts.util.CertUtils");
var NetUtil = Java.type("com.tremolosecurity.kubernetes.artifacts.util.NetUtil");
var k8s_namespace = 'openunison';
var redploy_openunison = false;
var System = Java.type("java.lang.System");
var Integer = Java.type("java.lang.Integer")


function process_key_pair_config(cfg_obj,key_config) {
    print("\n\nProcessing key '" + key_config.name + "'");
    create_keypair_template = cfg_obj.key_store.key_pairs.create_keypair_template;

    secret_info = key_config.create_data.secret_info;

    if (secret_info == null) {
        secret_info = {};
        secret_info['type_of_secret'] = 'kubernetes.io/tls';
        secret_info['cert_name'] = 'tls.crt';
        secret_info['key_name'] = 'tls.key';
    }

    //determine the namespace of the secret
    target_ns = k8s_namespace;
    if (key_config.create_data.target_namespace != null && key_config.create_data.target_namespace !== "") {
        target_ns = key_config.create_data.target_namespace;
    }

    var secret_name = "";
    if (key_config.tls_secret_name != null && key_config.tls_secret_name !== "") {
        secret_name = key_config.tls_secret_name;
    } else {
        secret_name = key_config.name;
    }

    //check if the secret already exists
    print("Checking if kubernetes secret exists")
    secret_response = k8s.callWS("/api/v1/namespaces/" + target_ns + "/secrets/" + secret_name,"",-1);
    secret_exists = false;

    if (secret_response.code == 200) {
        print("Secret exists")
        secret_json = JSON.parse(secret_response.data);
        
        
        if (secret_json.metadata != null && secret_json.metadata.labels != null && secret_json.metadata.labels["operated-by"] != null && secret_json.metadata.labels["operated-by"] ==  "openunison-operator") {
            
            //Managed by the operator, lets see if it needs to be rebuilt

            //first, check to see if the cert is going to expire
            var cert_from_secret = new java.lang.String(java.util.Base64.getDecoder().decode(secret_json.data[secret_info.cert_name]));
            print(cert_from_secret);
            if (CertUtils.isCertExpiring(CertUtils.string2cert(secret_json.data[secret_info.cert_name]),Integer.parseInt(System.getenv("CERT_DAYS_EXPIRE")))) {
                print("expiring");

                if (key_config.import_into_ks === "keypair" || key_config.import_into_ks === "certificate") {
                    print("cert needs to make it into the openunison keystore, deleting");
                    k8s.deleteWS("/api/v1/namespaces/" + target_ns + "/secrets/" + secret_name);
                    redploy_openunison = true;
                } else {
                    print("secret needs to be recreated");
                    create_certificate(target_ns,cfg_obj,key_config,secret_info,secret_name);
                }
            } else {
                print("not expiring");
            }


        }
    }

    /*
    
    */
    
    print("Key '" + key_config.name + "' finished");





}





function create_certificate(target_ns,cfg_obj,key_config,secret_info,secret_name) {
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
    server_name = key_config.create_data.server_name;
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
            print("Existing CSR, deleting");
            k8s.deleteWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests/' + server_name);
            apiResp = k8s.postWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests',JSON.stringify(csrReq));
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
    

    secret_to_create = {
        "apiVersion":"v1",
        "kind":"Secret",
        "type":secret_info.type_of_secret,
        "metadata": {
            "name": secret_name,
            "namespace": target_ns,
            "labels": {
                "tremolo_operator_created":"true",
                "operated-by": "openunison-operator"
            }
        },
        "data":{
            
        }
    };

    secret_to_create.data[ secret_info.cert_name ] = java.util.Base64.getEncoder().encodeToString(CertUtils.exportCert(x509data.getCertificate()).getBytes("UTF-8"));
    secret_to_create.data[ secret_info.key_name ] = java.util.Base64.getEncoder().encodeToString(CertUtils.exportKey(x509data.getKeyData().getPrivate()).getBytes("UTF-8"));


    
    print("Deleting existing secret");
    k8s.deleteWS("/api/v1/namespaces/" + target_ns + "/secrets/" + secret_name);
    

    print("Posting secret");
    k8s.postWS('/api/v1/namespaces/' + target_ns + '/secrets',JSON.stringify(secret_to_create));

    if (key_config.create_data.delete_pods_labels != null && key_config.create_data.delete_pods_labels.length > 0) {
        print("Deleting pods per labels");
        var label_selectors = '';
        for (var ii = 0;ii < key_config.create_data.delete_pods_labels.length;ii++) {
            if (ii > 0) {
                label_selectors = label_selectors + '&';
            }

            label_selectors = label_selectors + key_config.create_data.delete_pods_labels[ii];
        }
        pods_list_response = k8s.deleteWS('/api/v1/namespaces/' + target_ns + '/pods?labelSelector=' + label_selectors);
        print("Pods deleted");
    }
    
}













print("Loading openunisons");
search_res = k8s.callWS('/apis/openunison.tremolo.io/v1/namespaces/openunison/openunisons');
print(search_res);
if (search_res.code == 200) {
    print("openunisons found");
    openunisons = JSON.parse(search_res.data)["items"];
    for (var i = 0;i<openunisons.length;i++) {
        var openunison = openunisons[i];

        var keys = openunison.spec.key_store.key_pairs.keys;
        for (var j = 0;j<keys.length;j++) {
            var key = keys[j];
            process_key_pair_config(openunison.spec,key);
        }

        

    }

    if (redploy_openunison) {
        print("Restarting OpenUnison");
        patch = {
                "metadata": {
                    "annotations": {
                        "tremolo.io/cert-manager": (new org.joda.time.DateTime().toString())
                    }
                }
        };

        k8s.patchWS(openunison.metadata.selfLink,JSON.stringify(patch));
    }
} else {
    print("Error - could not load openunisons - " + JSON.stringify(search_res));
}

