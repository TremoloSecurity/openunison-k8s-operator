/*
    Kill the dashboard pod to 
*/
function restart_k8s_dashboard() {
    print("Restarting the dashboard");
    res = k8s.callWS('/api/v1/namespaces/kube-system/pods');
    pods = JSON.parse(res.data);

    k8s_db_uri = null;

    print("Looking for the dashboard");
    for (i=0;i<pods.items.length;i++) {
        pod = pods.items[i];
        if (pod.metadata.name.startsWith("kubernetes-dashboard")) {
            print("Dashboard found");
            k8s_db_uri = pod.metadata.selfLink;
        }
    }

    if (k8s_db_uri != null) {
        print("Deleting the pod");
        k8s.deleteWS(k8s_db_uri);
    }
}

function create_ingress_objects() {
    for (var i=0;i<cfg_obj.hosts.length;i++) {
        obj = {
            "apiVersion": "extensions/v1beta1",
            "kind": "Ingress",
            "metadata": {
                "annotations": {
                    "kubernetes.io/ingress.class": "nginx",
                    "nginx.ingress.kubernetes.io/backend-protocol": "https",
                    "nginx.ingress.kubernetes.io/secure-backends": "true",
                    "nginx.org/ssl-services": "openunison-" + k8s_obj.metadata.name,
                    "nginx.ingress.kubernetes.io/affinity": "cookie",
                    "nginx.ingress.kubernetes.io/session-cookie-name": cfg_obj.hosts[i].ingress_name + "-" + k8s_obj.metadata.name,
                    "nginx.ingress.kubernetes.io/session-cookie-hash": "sha1"
                },
                "name": cfg_obj.hosts[i].ingress_name,
                "namespace": k8s_namespace
            },
            "spec": {
                "rules": [
                    
                ],
                "tls": [
                    {
                        "hosts": [
                            
                        ],
                        "secretName": cfg_obj.hosts[i].secret_name
                    }
                ]
            },
            "status": {
                "loadBalancer": {}
            }
        };

        for (var j=0;j<cfg_obj.hosts[i].names.length;j++) {
            obj.spec.rules.push(
                {
                    "host": cfg_obj.hosts[i].names[j].name,
                    "http": {
                        "paths": [
                            {
                                "backend": {
                                    "serviceName": "openunison-" + k8s_obj.metadata.name,
                                    "servicePort": 443
                                },
                                "path": "/"
                            }
                        ]
                    }
                }
            );

            obj.spec.tls[0].hosts.push(cfg_obj.hosts[i].names[j].name);
        }
    
        k8s.postWS('/apis/extensions/v1beta1/namespaces/' + k8s_namespace + '/ingresses',JSON.stringify(obj));
    }
}


function create_k8s_deployment() {




    obj = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
            "labels": {
                "app": "openunison-" + k8s_obj.metadata.name,
                "operated-by": "openunison-operator"
            },
            "name": "openunison-" + k8s_obj.metadata.name,
            "namespace": k8s_namespace
        },
        "spec": {
            "progressDeadlineSeconds": 600,
            "replicas": cfg_obj.replicas,
            "revisionHistoryLimit": 10,
            "selector": {
                "matchLabels": {
                    "application": "openunison-" + k8s_obj.metadata.name
                }
            },
            "strategy": {
                "rollingUpdate": {
                    "maxSurge": "25%",
                    "maxUnavailable": "25%"
                },
                "type": "RollingUpdate"
            },
            "template": {
                "metadata": {
                    "creationTimestamp": null,
                    "labels": {
                        "application": "openunison-" + k8s_obj.metadata.name,
                        "operated-by": "openunison-operator"
                    }
                },
                "spec": {
                    "containers": [
                        {
                            "env": [
                                {
                                    "name": "JAVA_OPTS",
                                    "value": "-Djava.awt.headless=true -Djava.security.egd=file:/dev/./urandom -DunisonEnvironmentFile=/etc/openunison/ou.env -Djavax.net.ssl.trustStore=/etc/openunison/unisonKeyStore.p12"
                                },
                                {
                                    "name": "fortriggerupdates",
                                    "value": "changeme"
                                }
                            ],
                            "image": cfg_obj.image,
                            "imagePullPolicy": "Always",
                            "livenessProbe": {
                                "exec": {
                                    "command": [
                                        "/usr/local/openunison/bin/check_alive.py"
                                    ]
                                },
                                "failureThreshold": 10,
                                "initialDelaySeconds": 120,
                                "periodSeconds": 10,
                                "successThreshold": 1,
                                "timeoutSeconds": 10
                            },
                            "name": "openunison-" + k8s_obj.metadata.name,
                            "ports": [
                                {
                                    "containerPort": 8080,
                                    "name": "http",
                                    "protocol": "TCP"
                                },
                                {
                                    "containerPort": 8443,
                                    "name": "https",
                                    "protocol": "TCP"
                                }
                            ],
                            "readinessProbe": {
                                "exec": {
                                    "command": [
                                        "/usr/local/openunison/bin/check_alive.py",
                                        "https://127.0.0.1:8443/auth/idp/k8sIdp/.well-known/openid-configuration",
                                        "issuer"
                                    ]
                                },
                                "failureThreshold": 3,
                                "initialDelaySeconds": 30,
                                "periodSeconds": 10,
                                "successThreshold": 1,
                                "timeoutSeconds": 10
                            },
                            "resources": {},
                            "terminationMessagePath": "/dev/termination-log",
                            "terminationMessagePolicy": "File",
                            "volumeMounts": [
                                {
                                    "mountPath": "/etc/openunison",
                                    "name": "secret-volume",
                                    "readOnly": true
                                }
                            ]
                        }
                    ],
                    "dnsPolicy": "ClusterFirst",
                    "restartPolicy": "Always",
                    "terminationGracePeriodSeconds": 30,
                    "serviceAccount": "openunison-" + k8s_obj.metadata.name,
                    "volumes": [
                        {
                            "name": "secret-volume",
                            "secret": {
                                "defaultMode": 420,
                                "secretName": cfg_obj.dest_secret
                            }
                        }
                    ]
                }
            }
        }
    };

    if (! isEmpty(cfg_obj.deployment_data) ) {
        if (cfg_obj.deployment_data.tokenrequest_api.enabled) {
            configure_tokenapi_sa(obj);
        }

        if (! isEmpty(cfg_obj.deployment_data.readiness_probe_command) ) {
            obj.spec.template.spec.containers[0].readinessProbe.exec.command = cfg_obj.deployment_data.readiness_probe_command;
        }

        if (! isEmpty(cfg_obj.deployment_data.liveness_probe_command) ) {
            obj.spec.template.spec.containers[0].livenessProbe.exec.command = cfg_obj.deployment_data.liveness_probe_command;
        }

        print(cfg_obj.deployment_data.node_selectors);
        if (! isEmpty(cfg_obj.deployment_data.node_selectors)) {
            print("setting node selectors");
            obj.spec.template.spec["nodeSelector"] = {};
            print(JSON.stringify(obj.spec.template.spec["nodeSelector"]));
            for (var i = 0;i < cfg_obj.deployment_data.node_selectors.length;i++) {
                print(cfg_obj.deployment_data.node_selectors[i].name);
                print(cfg_obj.deployment_data.node_selectors[i].value);
                obj.spec.template.spec.nodeSelector[cfg_obj.deployment_data.node_selectors[i].name] = cfg_obj.deployment_data.node_selectors[i].value;
            }
            print(JSON.stringify(obj.spec.template.spec["nodeSelector"]));
        }

    }

    k8s.postWS('/apis/apps/v1/namespaces/' + k8s_namespace + '/deployments',JSON.stringify(obj));
}

/*
  Update the deployment for using the TokenAPI for the service account
*/
function configure_tokenapi_sa(deplotment) {
    deplotment.spec.template.spec["automountServiceAccountToken"] = false;

    var found_volumemount = false;
    for (var ii=0;ii<deplotment.spec.template.spec.containers[0].volumeMounts.length;ii++) {
        var volumeMount = deplotment.spec.template.spec.containers[0].volumeMounts[ii];
        print("checking '" + volumeMount.name + "'");
        if (volumeMount.name == "ou-token") {
            found_volumemount = true;
            break;
        }
    }

    if (! found_volumemount) {
        deplotment.spec.template.spec.containers[0].volumeMounts.push(
            {
                "mountPath":"/var/run/secrets/tokens",
                "name":"ou-token"
            }
        );
    }

    var found_volume = false;
    for (var ii=0;ii<deplotment.spec.template.spec.volumes.length;ii++) {
        var volume = deplotment.spec.template.spec.volumes[ii];
        if (volume.name == "ou-token") {
            found_volume = true;
        }
    }

    if (! found_volume) {
        deplotment.spec.template.spec.volumes.push(
            {
                "name": "ou-token",
                "projected": {
                    "defaultMode": 420,
                    "sources": [
                    {
                        "serviceAccountToken": {
                        "audience": cfg_obj.deployment_data.tokenrequest_api.audience,
                        "expirationSeconds": cfg_obj.deployment_data.tokenrequest_api.expirationSeconds,
                        "path": "ou-token"
                        }
                    },
                    {
                        "configMap": {
                        "items": [
                            {
                            "key": "ca.crt",
                            "path": "ca.crt"
                            }
                        ],
                        "name": "kube-cacrt"
                        }
                    }
                    ]
                }
                }
        );
    }
    //get the secret's CA cert
    k8s_api_cert = NetUtil.downloadFile("file:///var/run/secrets/kubernetes.io/serviceaccount/ca.crt");

    results = k8s.callWS("/api/v1/namespaces/" + k8s_namespace + "/configmaps/kube-cacrt","",-1);

    if (results.code == 200) {
        //patch
        cacrt_configmap = {
            "data": {
                "ca.crt": k8s_api_cert
            }
        }

        print("Patching API server configmap");
        k8s.patchWS("/api/v1/namespaces/" + k8s_namespace + "/configmaps/kube-cacrt",JSON.stringify(cacrt_configmap));
    } else {
        //create the secret
        cacrt_configmap = {
            "apiVersion": "v1",
            "data": {
                "ca.crt": k8s_api_cert
            },
            "kind": "ConfigMap",
            "metadata": {
                "name": "kube-cacrt",
                "namespace": k8s_namespace
            }
        }

        print("Creating API server configmap");
        k8s.postWS("/api/v1/namespaces/" + k8s_namespace + "/configmaps",JSON.stringify(cacrt_configmap));
        
    };
}

function disable_tokenapi_sa(deplotment) {
    deplotment.spec.template.spec["automountServiceAccountToken"] = true;
    
    for (var ii=0;ii<deplotment.spec.template.spec.containers[0].volumeMounts.length;ii++) {
        var volumeMount = deplotment.spec.template.spec.containers[0].volumeMounts[ii];
        print("checking '" + volumeMount.name + "'");
        if (volumeMount.name == "ou-token") {
            print("Removing");
            deplotment.spec.template.spec.containers[0].volumeMounts.splice(ii,1);
            print("after remove : '" + JSON.stringify(deplotment.spec.template.spec.containers[0].volumeMounts) + "'");
            break;
        }
    }
    
    for (var ii=0;ii<deplotment.spec.template.spec.volumes.length;ii++) {
        var volume = deplotment.spec.template.spec.volumes[ii];
        if (volume.name == "ou-token") {
            deplotment.spec.template.spec.volumes.splice(ii,1);
        }
    }
}

/*
  Uopdate the deployment based on the CRD
*/

function update_k8s_deployment() {
    deployment_info = k8s.callWS('/apis/apps/v1/namespaces/' + k8s_namespace + "/deployments/openunison-" + k8s_obj.metadata.name,"",0);

    if (deployment_info.code == 200) {

        deployment = JSON.parse(deployment_info.data);


        patch = {
            "spec" : {
                "template" : deployment.spec.template                
            }
        };

        if (patch.spec.template.metadata.annotations == null) {
            patch.spec.template.metadata.annotations = {};
        }
        patch.spec.template.metadata.annotations["tremolo.io/update"] = java.util.UUID.randomUUID().toString();

        

        if (deployment.spec.replicas != cfg_obj.replicas) {
            print("Changeing the number of replicas");
            patch.spec['replicas'] = cfg_obj.replicas;
        }

        if (deployment.spec.template.spec.containers[0].image !== cfg_obj.image) {
            print("Changing the image");
            
            patch.spec.template.spec.containers[0].image = cfg_obj.image;
        }


        print("checking if need to update deployment info");
        if (! isEmpty(cfg_obj.deployment_data) ) {
            print("There's deployment data");
            if (cfg_obj.deployment_data.tokenrequest_api.enabled) {
                print("Enabling the TokenRequest API");
                configure_tokenapi_sa(patch);
                
            } else {
                disable_tokenapi_sa(patch); 
            }


            if (! isEmpty(cfg_obj.deployment_data.readiness_probe_command) ) {
                patch.spec.template.spec.containers[0].readinessProbe.exec.command = cfg_obj.deployment_data.readiness_probe_command;
            }
    
            if (! isEmpty(cfg_obj.deployment_data.liveness_probe_command) ) {
                patch.spec.template.spec.containers[0].livenessProbe.exec.command = cfg_obj.deployment_data.liveness_probe_command;
            }
    
            
            if (cfg_obj.deployment_data.node_selectors !== undefined ) {
                print("setting node selectors");
                
                patch.spec.template.spec["nodeSelector"] = {};
                
                for (var i = 0;i < cfg_obj.deployment_data.node_selectors.length;i++) {
                    
                    patch.spec.template.spec.nodeSelector[cfg_obj.deployment_data.node_selectors[i].name] = cfg_obj.deployment_data.node_selectors[i].value;
                }
                

                if (isEmpty(patch.spec.template.spec["nodeSelector"])) {
                    
                    patch.spec.template.spec["nodeSelector"] = null;
                }
            }
        } else {
            disable_tokenapi_sa(patch);
        }
        
        

        k8s.patchWS('/apis/apps/v1/namespaces/' + k8s_namespace + "/deployments/openunison-" + k8s_obj.metadata.name,JSON.stringify(patch));

        if (cfg_obj.enable_activemq) {
            deployment_info = k8s.callWS('/apis/apps/v1/namespaces/' + k8s_namespace + "/deployments/amq-" + k8s_obj.metadata.name,"",-1);
            if (deployment_info.code == 200) {
                generate_amq_secrets();

                deployment = JSON.parse(deployment_info.data);

                update_image = deployment.spec.template.spec.containers[0].image != cfg_obj.activemq_image;


                if (! update_image && (amq_secrets_changed || amq_env_secrets_changed)) {
                    


                    patch = {
                        "spec" : {
                            "template" : deployment.spec.template                
                        }
                    };

                    if (patch.spec.template.metadata.annotations == null) {
                        patch.spec.template.metadata.annotations = {};
                    }
                    patch.spec.template.metadata.annotations["tremolo.io/update"] = java.util.UUID.randomUUID().toString();

                    k8s.patchWS('/apis/apps/v1/namespaces/' + k8s_namespace + "/deployments/amq-" + k8s_obj.metadata.name,JSON.stringify(patch));
                } else if (update_image) {
                    patch = {
                        "spec" : {
                            "template" : deployment.spec.template                
                        }
                    };

                    patch.spec.template.spec.containers[0].image = cfg_obj.activemq_image;
                    k8s.patchWS('/apis/apps/v1/namespaces/' + k8s_namespace + "/deployments/amq-" + k8s_obj.metadata.name,JSON.stringify(patch));
                }

            } else {
                //deploy activemq
                create_activemq();
            }
        } else {
            //delete everything activemq
            delete_activemq();
        }
        
    } else {
        print("No deployment found, running create");
        create_static_objects();

    }

    manageCertMgrJob();
}

/*
    Delete the activemq resources
*/
function delete_activemq() {
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/amq-secrets-' + k8s_obj.metadata.name);
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/amq-env-secrets-' + k8s_obj.metadata.name);
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/services/amq');

    if (k8s.isOpenShift()) {
        k8s.deleteWS("/apis/image.openshift.io/v1/namespaces/" + k8s_namespace + "/imagestreams/amq-" + k8s_obj.metadata.name);
        k8s.deleteWS('/apis/apps.openshift.io/v1/namespaces/' + k8s_namespace + '/deploymentconfigs/amq-' + k8s_obj.metadata.name);
    } else {
        k8s.deleteWS('/apis/apps/v1/namespaces/' + k8s_namespace + '/deployments/amq-' + k8s_obj.metadata.name);
    }
}

/*
Deletes objects created by the operator
*/

function delete_k8s_deployment() {
    
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/services/openunison-' + k8s_obj.metadata.name);
    k8s.deleteWS('/apis/rbac.authorization.k8s.io/v1/namespaces/' + k8s_namespace + '/rolebindings/oidc-user-sessions-' + k8s_obj.metadata.name);
    k8s.deleteWS('/apis/rbac.authorization.k8s.io/v1/namespaces/' + k8s_namespace + '/roles/oidc-user-sessions-' + k8s_obj.metadata.name);
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/serviceaccounts/openunison-' + k8s_obj.metadata.name);

    
    if (k8s.isOpenShift()) {
        k8s.deleteWS('/apis/apps.openshift.io/v1/namespaces/' + k8s_namespace + "/deploymentconfigs/openunison-" + k8s_obj.metadata.name);
        k8s.deleteWS('/apis/build.openshift.io/v1/namespaces/' + k8s_namespace + "/buildconfigs/openunison-" + k8s_obj.metadata.name);
        k8s.deleteWS('/apis/image.openshift.io/v1/namespaces/' + k8s_namespace + "/imagestreams/openunison-" + k8s_obj.metadata.name);
        k8s.deleteWS('/apis/image.openshift.io/v1/namespaces/' + k8s_namespace + "/imagestreams/openunison-s2i-" + k8s_obj.metadata.name);
        k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + "/secrets/redhat-registry-" + k8s_obj.metadata.name);

        for (var i=0;i<cfg_obj.hosts.length;i++) {
            k8s.deleteWS('/apis/route.openshift.io/v1/namespaces/' + k8s_namespace + '/routes/openunison-https-' + k8s_obj.metadata.name + "-" + cfg_obj.hosts[i].ingress_name);
        }

    } else {
        k8s.deleteWS('/apis/apps/v1/namespaces/' + k8s_namespace + "/deployments/openunison-" + k8s_obj.metadata.name);
        for (var i=0;i<cfg_obj.hosts.length;i++) {
            k8s.deleteWS('/apis/extensions/v1beta1/namespaces/' + k8s_namespace + '/ingresses/' + cfg_obj.hosts[i].ingress_name);
        }
    }




    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/' + cfg_obj.dest_secret);
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/' + k8s_obj.metadata.name + '-static-keys');


    if (cfg_obj.enable_activemq) {
        delete_activemq();

    }


    print("checking keys");
    for (var i=0;i<cfg_obj.key_store.key_pairs.keys.length;i++) {
        print("key pair : " + i);
        key_data = cfg_obj.key_store.key_pairs.keys[i];
        if (key_data.create_data != null) {
            print("has key");
            secret_name = key_data.name;

            if (key_data.tls_secret_name != null && key_data.tls_secret_name !== "") {
                secret_name = key_data.tls_secret_name;
            }
    
            k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/' + secret_name);
        }

        
    }

    
}

function deploy_k8s_activemq() {
    amq_deployment_config = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
           "labels": {
              "app": "amq-" + k8s_obj.metadata.name,
              "operated-by": "openunison-operator"
           },
           "name": "amq-" + k8s_obj.metadata.name,
           "namespace": k8s_namespace
        },
        "spec": {
            "strategy": {
                "type": "Recreate"
            },
            "replicas": cfg_obj.replicas,
            "selector": {
                "matchLabels" : {
                    "app": "amq-" + k8s_obj.metadata.name
                }
            },
           "template": {
              "metadata": {
                 "creationTimestamp": null,
                 "labels": {
                    "app": "amq-" + k8s_obj.metadata.name,
                    "operated-by": "openunison-operator"
                 }
              },
              "spec": {
                 "containers": [
                    {
                       "env": [
                          {
                             "name": "ACTIVEMQ_DEBUG_OPTS",
                             "value": "-Djava.awt.headless=true -Djava.security.egd=file:/dev/./urandom"
                          },
                          {
                             "name": "JDBC_DRIVER",
                             "valueFrom": {
                                "secretKeyRef": {
                                   "name": "amq-env-secrets-" + k8s_obj.metadata.name,
                                   "key": "JDBC_DRIVER"
                                }
                             }
                          },
                          {
                             "name": "JDBC_URL",
                             "valueFrom": {
                                "secretKeyRef": {
                                   "name": "amq-env-secrets-" + k8s_obj.metadata.name,
                                   "key": "JDBC_URL"
                                }
                             }
                          },
                          {
                             "name": "JDBC_USER",
                             "valueFrom": {
                                "secretKeyRef": {
                                   "name": "amq-env-secrets-" + k8s_obj.metadata.name,
                                   "key": "JDBC_USER"
                                }
                             }
                          },
                          {
                             "name": "JDBC_PASSWORD",
                             "valueFrom": {
                                "secretKeyRef": {
                                   "name": "amq-env-secrets-" + k8s_obj.metadata.name,
                                   "key": "JDBC_PASSWORD"
                                }
                             }
                          },
                          {
                             "name": "TLS_KS_PWD",
                             "valueFrom": {
                                "secretKeyRef": {
                                   "name": "amq-env-secrets-" + k8s_obj.metadata.name,
                                   "key": "TLS_KS_PWD"
                                }
                             }
                          }
                       ],
                       "image": cfg_obj.activemq_image,
                       "imagePullPolicy": "Always",
                       "livenessProbe": {
                          "exec": {
                             "command": [
                                "/usr/bin/health_check.sh"
                             ]
                          },
                          "failureThreshold": 10,
                          "initialDelaySeconds": 10,
                          "periodSeconds": 10,
                          "successThreshold": 1,
                          "timeoutSeconds": 10
                       },
                       "name": "amq-" + k8s_obj.metadata.name,
                       "ports": [
                          {
                             "containerPort": 8080,
                             "name": "http",
                             "protocol": "TCP"
                          },
                          {
                             "containerPort": 8443,
                             "name": "https",
                             "protocol": "TCP"
                          }
                       ],
                       "readinessProbe": {
                          "exec": {
                             "command": [
                                "/usr/bin/health_check.sh"
                             ]
                          },
                          "failureThreshold": 3,
                          "initialDelaySeconds": 10,
                          "periodSeconds": 10,
                          "successThreshold": 1,
                          "timeoutSeconds": 10
                       },
                       "resources": {},
                       "terminationMessagePath": "/dev/termination-log",
                       "terminationMessagePolicy": "File",
                       "volumeMounts": [
                          {
                             "mountPath": "/etc/activemq",
                             "name": "secret-volume",
                             "readOnly": true
                          },
                          {
                              "name":"local-data",
                              "mountPath":"/usr/local/activemq/data"
                          },
                          {
                              "name":"jetty-tmp",
                              "mountPath":"/usr/local/activemq/tmp"
                          }
                       ]
                    }
                 ],
                 "dnsPolicy": "ClusterFirst",
                 "restartPolicy": "Always",
                 "terminationGracePeriodSeconds": 30,
                 "volumes": [
                    {
                       "name": "secret-volume",
                       "secret": {
                          "defaultMode": 420,
                          "secretName": "amq-secrets-" + k8s_obj.metadata.name
                       }
                    },
                    {
                        "name":"local-data",
                        "emptyDir": {}
                    },
                    {
                        "name":"jetty-tmp",
                        "emptyDir":{}
                    }
                 ]
              }
           }
        }
     };

     print(k8s.postWS('/apis/apps/v1/namespaces/' + k8s_namespace + '/deployments',JSON.stringify(amq_deployment_config)).data);
}

