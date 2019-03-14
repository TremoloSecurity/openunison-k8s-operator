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

function create_static_objects() {
    obj = {"apiVersion":"v1","kind":"ServiceAccount","metadata":{"creationTimestamp":null,"name":"openunison-" + k8s_obj.metadata.name}};
    k8s.postWS('/api/v1/namespaces/' + k8s_namespace + '/serviceaccounts',JSON.stringify(obj));

    obj = {
        "kind": "Role",
        "apiVersion": "rbac.authorization.k8s.io/v1",
        "metadata": {
            "namespace": k8s_namespace,
            "name": "oidc-user-sessions-" + k8s_obj.metadata.name
        },
        "rules": [
            {
                "apiGroups": [
                    "openunison.tremolo.io"
                ],
                "resources": [
                    "oidc-sessions",
                    "users"
                ],
                "verbs": [
                    "*"
                ]
            }
        ]
    };

    k8s.postWS('/apis/rbac.authorization.k8s.io/v1/namespaces/' + k8s_namespace + '/roles',JSON.stringify(obj));

    obj = {
        "kind": "RoleBinding",
        "apiVersion": "rbac.authorization.k8s.io/v1",
        "metadata": {
            "name": "oidc-user-sessions-" + k8s_obj.metadata.name,
            "namespace": k8s_namespace
        },
        "subjects": [
            {
                "kind": "ServiceAccount",
                "name": "openunison-" + k8s_obj.metadata.name,
                "namespace": k8s_namespace
            }
        ],
        "roleRef": {
            "kind": "Role",
            "name": "oidc-user-sessions-" + k8s_obj.metadata.name,
            "apiGroup": "rbac.authorization.k8s.io"
        }
    };

    k8s.postWS('/apis/rbac.authorization.k8s.io/v1/namespaces/' + k8s_namespace + '/rolebindings',JSON.stringify(obj))

    create_ingress_objects();

    

    obj = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "labels": {
                "app": "openunison-" + k8s_obj.metadata.name
            },
            "name": "openunison-" + k8s_obj.metadata.name,
            "namespace": k8s_namespace
        },
        "spec": {
            "ports": [
                {
                    "name": "openunison-secure-" + k8s_obj.metadata.name,
                    "port": 443,
                    "protocol": "TCP",
                    "targetPort": 8443
                },
                {
                    "name": "openunison-insecure-" + k8s_obj.metadata.name,
                    "port": 80,
                    "protocol": "TCP",
                    "targetPort": 8080
                }
            ],
            "selector": {
                "app": "openunison-" + k8s_obj.metadata.name
            },
            "sessionAffinity": "ClientIP",
            "sessionAffinityConfig": {
                "clientIP": {
                    "timeoutSeconds": 10800
                }
            },
            "type": "ClusterIP"
        },
        "status": {
            "loadBalancer": {}
        }
    };

    k8s.postWS('/api/v1/namespaces/' + k8s_namespace + '/services',JSON.stringify(obj));

    obj = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
            "labels": {
                "app": "openunison-" + k8s_obj.metadata.name
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
                    "app": "openunison-" + k8s_obj.metadata.name
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
                        "app": "openunison-" + k8s_obj.metadata.name
                    }
                },
                "spec": {
                    "containers": [
                        {
                            "env": [
                                {
                                    "name": "JAVA_OPTS",
                                    "value": "-Djava.awt.headless=true -Djava.security.egd=file:/dev/./urandom\n-DunisonEnvironmentFile=/etc/openunison/ou.env"
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

    k8s.postWS('/apis/apps/v1/namespaces/' + k8s_namespace + '/deployments',JSON.stringify(obj));
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

        k8s.patchWS('/apis/apps/v1/namespaces/' + k8s_namespace + "/deployments/openunison-" + k8s_obj.metadata.name,JSON.stringify(patch));
        
    } else {
        print("No deployment found, running create");
        create_static_objects();

    }
}

/*
Deletes objects created by the operator
*/

function delete_k8s_deployment() {
    k8s.deleteWS('/apis/apps/v1/namespaces/' + k8s_namespace + "/deployments/openunison-" + k8s_obj.metadata.name);
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/services/openunison-' + k8s_obj.metadata.name);
    k8s.deleteWS('/apis/rbac.authorization.k8s.io/v1/namespaces/' + k8s_namespace + '/rolebindings/oidc-user-sessions-' + k8s_obj.metadata.name);
    k8s.deleteWS('/apis/rbac.authorization.k8s.io/v1/namespaces/' + k8s_namespace + '/roles/oidc-user-sessions-' + k8s_obj.metadata.name);
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/serviceaccounts/openunison-' + k8s_obj.metadata.name);

    for (var i=0;i<cfg_obj.hosts.length;i++) {
        k8s.deleteWS('/apis/extensions/v1beta1/namespaces/' + k8s_namespace + '/ingresses/' + cfg_obj.hosts[i].ingress_name);
    }

    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/' + cfg_obj.dest_secret);
    k8s.deleteWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/' + k8s_obj.metadata.name + '-static-keys');

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