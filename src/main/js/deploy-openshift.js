function deploy_openshift_objects() {
    print("Creating registry secret");

    if (inProp['REG_CRED_USER'] != null) {
        username = inProp['REG_CRED_USER'];
        password = inProp['REG_CRED_PASSWORD'];
        b64Creds = java.util.Base64.getEncoder().encodeToString((username + ':' + password).getBytes("UTF-8"));
        //TODO determine this from the builder image
        credServer = cfg_obj.openshift.builder_image.substring(0,cfg_obj.openshift.builder_image.indexOf('/'));
        print("Registry Server - '" + credServer + "'");
      
      
        docker_creds = {};
        docker_creds["auths"] = {};
        docker_creds["auths"][credServer] = {
          "username": username,
          "password": password,
          "email": "doesnotmatter@doesnotmatter.com",
          "auth": b64Creds
        };
      
        
        docker_secret = {
          "apiVersion": "v1",
          "data": {
            ".dockerconfigjson": java.util.Base64.getEncoder().encodeToString(JSON.stringify(docker_creds).getBytes("UTF-8"))
          },
          "kind": "Secret",
          "metadata": {
            "name": "redhat-registry-" + k8s_obj.metadata.name,
            "namespace": k8s_namespace
          },
          "type": "kubernetes.io/dockerconfigjson"
        }
      
        res = k8s.postWS("/api/v1/namespaces/" + k8s_namespace + "/secrets",JSON.stringify(docker_secret));
        print(res.data);
      
    }

    print("import builder image");



    


    import_builder_image = {
    "kind": "ImageStreamImport",
    "apiVersion": "image.openshift.io/v1",
    "metadata": {
        "name": "openunison-s2i-" + k8s_obj.metadata.name,
        "namespace": k8s_namespace,
        "creationTimestamp": null
    },
    "spec": {
        "import": true,
        "images": [
        {
            "from": {
            "kind": "DockerImage",
            "name": cfg_obj.openshift.builder_image
            },
            "to": {
            "name": "latest"
            },
            "importPolicy": {},
            "referencePolicy": {
            "type": ""
            }
        }
        ]
    },
    "status": {}
    };

    res = k8s.postWS("/apis/image.openshift.io/v1/namespaces/" + k8s_namespace + "/imagestreamimports",JSON.stringify(import_builder_image));

    print(res);

    ou_imagestream = {
        "kind": "ImageStream",
        "apiVersion": "image.openshift.io/v1",
        "metadata": {
            "name": "openunison-" + k8s_obj.metadata.name,
            "labels": {
                "application": "openunison-" + k8s_obj.metadata.name,
                "operated-by": "openunison-operator"
            }
        }
    };
    
    k8s.postWS('/apis/image.openshift.io/v1/namespaces/' + k8s_namespace + '/imagestreams',JSON.stringify(ou_imagestream));
    
    ou_build = {
        "kind": "BuildConfig",
        "apiVersion": "build.openshift.io/v1",
        "metadata": {
            "name": "openunison-" + k8s_obj.metadata.name,
            "labels": {
                "application": "openunison",
                "operated-by": "openunison-operator"
            }
        },
        "spec": {
            "source": {
                "type": "Git",
                "git": {
                    "uri": cfg_obj.openshift.git.repo,
                    "ref": cfg_obj.openshift.git.branch
                },
                "contextDir": cfg_obj.openshift.git.dir
            },
            "strategy": {
                "type": "Source",
                "sourceStrategy": {
                    "env": [],
                    "forcePull": true,
                    "from": {
                        "kind": "ImageStreamTag",
                        "namespace": k8s_namespace,
                        "name": "openunison-s2i-" + k8s_obj.metadata.name + ":latest"
                    }
                }
            },
            "output": {
                "to": {
                    "kind": "ImageStreamTag",
                    "name": "openunison-" + k8s_obj.metadata.name + ":latest"
                }
            },
            "triggers": [
                {
                    "type": "ImageChange",
                    "imageChange": {}
                },
                {
                    "type": "ConfigChange"
                }
            ]
        }
    };
    
    if (inProp['REG_CRED_USER'] != null) {
      ou_build.spec.strategy.sourceStrategy['pullSecret'] = {"name":"redhat-registry-" + k8s_obj.metadata.name};
    }
    
    k8s.postWS('/apis/build.openshift.io/v1/namespaces/' + k8s_namespace + '/buildconfigs',JSON.stringify(ou_build));
    
    ou_deployment = {
        "kind": "DeploymentConfig",
        "apiVersion": "apps.openshift.io/v1",
        "metadata": {
            "name": "openunison-" + k8s_obj.metadata.name,
            "labels": {
                "application": "openunison-" + k8s_obj.metadata.name,
                "operated-by": "openunison-operator"
            }
        },
        "spec": {
            "strategy": {
                "rollingParams": {
                    "maxSurge": "25%",
                    "maxUnavailable": "25%"
                },
                "type": "Rolling"
            },
            "triggers": [
                {
                    "type": "ImageChange",
                    "imageChangeParams": {
                        "automatic": true,
                        "containerNames": [
                            "openunison-" + k8s_obj.metadata.name
                        ],
                        "from": {
                            "kind": "ImageStreamTag",
                            "name": "openunison-" + k8s_obj.metadata.name + ":latest"
                        }
                    }
                },
                {
                    "type": "ConfigChange"
                }
            ],
            "replicas": cfg_obj.replicas,
            "selector": {
                "deploymentConfig": "openunison-" + k8s_obj.metadata.name
            },
            "template": {
                "metadata": {
                    "name": "openunison-" + k8s_obj.metadata.name,
                    "labels": {
                        "deploymentConfig": "openunison-" + k8s_obj.metadata.name,
                        "application": "openunison-" + k8s_obj.metadata.name,
                        "operated-by": "openunison-operator"
                    }
                },
                "spec": {
                    "terminationGracePeriodSeconds": 60,
                    "containers": [
                        {
                            "name": "openunison-" + k8s_obj.metadata.name,
                            "image": "openunison-" + k8s_obj.metadata.name,
                            "imagePullPolicy": "Always",
                            "volumeMounts": [
                                {
                                    "name": "secret-volume",
                                    "mountPath": "/etc/openunison",
                                    "readOnly": true
                                }
                            ],
                            "livenessProbe": {
                                "exec": {
                                    "command": [
                                        "/usr/local/openunison/bin/check_alive.py"
                                    ]
                                },
                                "initialDelaySeconds": 30,
                                "timeoutSeconds": 10,
                  "failureThreshold":10
                            },
                            "readinessProbe": {
                                "exec": {
                                    "command": [
                                        "/usr/local/openunison/bin/check_alive.py"
                                    ]
                                },
                                "initialDelaySeconds": 30,
                                "timeoutSeconds": 10,
                  "failureThreshold":10
                            },
                            "ports": [
                                {
                                    "name": "http",
                                    "containerPort": 8080,
                                    "protocol": "TCP"
                                },
                                {
                                    "name": "https",
                                    "containerPort": 8443,
                                    "protocol": "TCP"
                                }
                            ],
                            "env": [
                                {
                                    "name": "JAVA_OPTS",
                                    "value": "-Djava.awt.headless=true -Djava.security.egd=file:/dev/./urandom\n-DunisonEnvironmentFile=/etc/openunison/ou.env"
                                }
                            ]
                        }
            ],
            "serviceAccount":"openunison-" + k8s_obj.metadata.name,
            "serviceAccountName":"openunison-" + k8s_obj.metadata.name,
                    "volumes": [
                        {
                            "name": "secret-volume",
                            "secret": {
                                "secretName": cfg_obj.dest_secret
                            }
                        }
                    ]
                }
            }
        }
    };
    
    k8s.postWS('/apis/apps.openshift.io/v1/namespaces/' + k8s_namespace + '/deploymentconfigs',JSON.stringify(ou_deployment));

    for (var i=0;i<cfg_obj.hosts.length;i++) {
        for (var j=0;j<cfg_obj.hosts[i].names.length;j++) {
            ou_route = {
                "kind": "Route",
                "apiVersion": "route.openshift.io/v1",
                "id": "openunison-https-" + k8s_obj.metadata.name + "-" + cfg_obj.hosts[i].ingress_name,
                "metadata": {
                    "name": "openunison-https-" + k8s_obj.metadata.name + "-" + cfg_obj.hosts[i].ingress_name,
                    "labels": {
                        "application": "openunison-" + k8s_obj.metadata.name,
                        "operated-by": "openunison-operator"
                    },
                    "annotations": {
                        "description": "Route for OpenUnison's https service."
                    }
                },
                "spec": {
                    "host": cfg_obj.hosts[i].names[j].name ,
                    "port": {
                        "targetPort": "openunison-secure-" + k8s_obj.metadata.name
                    },
                    "to": {
                        "kind": "Service",
                        "name": "openunison-" + k8s_obj.metadata.name
                    },
                    "tls": {
                        "termination": "reencrypt",
                        "destinationCACertificate":   CertUtils.exportCert(ouKs.getCertificate(cfg_obj.openunison_network_configuration.secure_key_alias))
                    }
                }
            };

            print(JSON.stringify(ou_route));
            res = k8s.postWS('/apis/route.openshift.io/v1/namespaces/' +  k8s_namespace   + '/routes',JSON.stringify(ou_route));
        }
    }

}

function deploy_amq_openshift() {
    


    import_amq_image = {
        "kind": "ImageStreamImport",
        "apiVersion": "image.openshift.io/v1",
        "metadata": {
            "name": "amq-" + k8s_obj.metadata.name,
            "namespace": k8s_namespace,
            "creationTimestamp": null
        },
        "spec": {
            "import": true,
            "images": [
            {
                "from": {
                "kind": "DockerImage",
                "name": cfg_obj.activemq_image
                },
                "to": {
                "name": "latest"
                },
                "importPolicy": {},
                "referencePolicy": {
                "type": ""
                }
            }
            ]
        },
        "status": {}
    };

    res = k8s.postWS("/apis/image.openshift.io/v1/namespaces/" + k8s_namespace + "/imagestreamimports",JSON.stringify(import_amq_image));

    amq_deployment_config = {
        "apiVersion": "apps.openshift.io/v1",
        "kind": "DeploymentConfig",
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
            "triggers": [
                {
                    "type": "ImageChange",
                    "imageChangeParams": {
                        "automatic": true,
                        "containerNames": [
                            "amq-" + k8s_obj.metadata.name
                        ],
                        "from": {
                            "kind": "ImageStreamTag",
                            "name": "amq-" + k8s_obj.metadata.name + ":latest"
                        }
                    }
                },
                {
                    "type": "ConfigChange"
                }
            ],
            "replicas": cfg_obj.replicas,
            "selector": {
                "app": "amq-" + k8s_obj.metadata.name
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
                             "name": "JAVA_OPTS",
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
                       "image": "amq-" + k8s_obj.metadata.name,
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

     print(k8s.postWS('/apis/apps.openshift.io/v1/namespaces/' + k8s_namespace + '/deploymentconfigs',JSON.stringify(amq_deployment_config)).data);
}


function update_image_stream(deployment,image_stream_name,new_image_tag) {
    image_stream_response = k8s.callWS('/apis/image.openshift.io/v1/namespaces/' + k8s_namespace + '/imagestreams/' + image_stream_name);
    image_stream = JSON.parse(image_stream_response.data);

    current_image = null;

    for (var i=0;i<deployment.spec.triggers.length;i++) {
        if (deployment.spec.triggers[i].type == "ImageChange") {
            current_image = deployment.spec.triggers[i].imageChangeParams.from.name;
        }
    }

    print("Current amq image from stream : " + current_image);

    if (current_image != null) {
        tag = current_image.substring(current_image.lastIndexOf(':') + 1);
        print("Checking Tag - " + tag);

        tags = image_stream.spec.tags;

        

        for (var i = 0;i<tags.length;i++) {
            print("Tag " + i + " : " + tags[i].name);
            if (tags[i].name == tag) {
                
                if (tags[i].from.name != new_image_tag) {
                    tags[i].from.name = new_image_tag;

                    json_patch = {
                        "spec": {
                            "tags" : tags
                        }
                        
                    }

                    k8s.patchWS('/apis/image.openshift.io/v1/namespaces/' + k8s_namespace + '/imagestreams/' + image_stream_name,JSON.stringify(json_patch));
                    return true;
                }
            }
        }
    }

    return false;
}

function update_openshift_deploymentconfig() {
    deployment_info = k8s.callWS('/apis/apps.openshift.io/v1/namespaces/' + k8s_namespace + "/deploymentconfigs/openunison-" + k8s_obj.metadata.name,"",0);

    if (deployment_info.code == 200) {

        deployment = JSON.parse(deployment_info.data);


        updated_image = update_image_stream(deployment,'openunison-s2i-' + k8s_obj.metadata.name,cfg_obj.openshift.builder_image);

        patch = {
            "spec" : {
                "template" : deployment.spec.template                
            }
        };

        if (patch.spec.template.metadata.annotations == null) {
            patch.spec.template.metadata.annotations = {};
        }
        patch.spec.template.metadata.annotations["tremolo.io/update"] = java.util.UUID.randomUUID().toString();

        var replicas_changed = false;
        

        if (deployment.spec.replicas != cfg_obj.replicas) {
            replicase_changed = true;
            print("Changeing the number of replicas");
            patch.spec['replicas'] = cfg_obj.replicas;
        }

        

        if (! updated_image && (replicas_changed || secret_data_changed)) {
            k8s.patchWS('/apis/apps.openshift.io/v1/namespaces/' + k8s_namespace + "/deploymentconfigs/openunison-" + k8s_obj.metadata.name,JSON.stringify(patch));
        } else {
            print("No changes to the deployment configuration");
        }

        for (var i=0;i<cfg_obj.hosts.length;i++) {
            for (var j=0;j<cfg_obj.hosts[i].names.length;j++) {
                
                route_response = k8s.callWS('/apis/route.openshift.io/v1/namespaces/' +  k8s_namespace   + '/routes/openunison-https-' + k8s_obj.metadata.name + "-" + cfg_obj.hosts[i].ingress_name,"",-1 );

                if (route_response.code == 200) {
                    new_cert = CertUtils.exportCert(ouKs.getCertificate(cfg_obj.openunison_network_configuration.secure_key_alias));
                    route = JSON.parse(route_response.data);
                    current_cert = route.spec.tls.destinationCACertificate;
                    
                    if (route.spec.tls.termination == "reencrypt" && new_cert != current_cert) {
                        json_patch = {
                            "spec" : {
                                "tls": {
                                    "destinationCACertificate": new_cert
                                }
                            }
                        }

                        k8s.patchWS('/apis/route.openshift.io/v1/namespaces/' +  k8s_namespace   + '/routes/openunison-https-' + k8s_obj.metadata.name + "-" + cfg_obj.hosts[i].ingress_name,JSON.stringify(json_patch));
                    }
                } else {
                    ou_route = {
                        "kind": "Route",
                        "apiVersion": "route.openshift.io/v1",
                        "id": "openunison-https-" + k8s_obj.metadata.name + "-" + cfg_obj.hosts[i].ingress_name,
                        "metadata": {
                            "name": "openunison-https-" + k8s_obj.metadata.name + "-" + cfg_obj.hosts[i].ingress_name,
                            "labels": {
                                "application": "openunison-" + k8s_obj.metadata.name,
                                "operated-by": "openunison-operator"
                            },
                            "annotations": {
                                "description": "Route for OpenUnison's https service."
                            }
                        },
                        "spec": {
                            "host": cfg_obj.hosts[i].names[j].name ,
                            "port": {
                                "targetPort": "openunison-secure-" + k8s_obj.metadata.name
                            },
                            "to": {
                                "kind": "Service",
                                "name": "openunison-" + k8s_obj.metadata.name
                            },
                            "tls": {
                                "termination": "reencrypt",
                                "destinationCACertificate":   CertUtils.exportCert(ouKs.getCertificate(cfg_obj.openunison_network_configuration.secure_key_alias))
                            }
                        }
                    };
        
                    
                    res = k8s.postWS('/apis/route.openshift.io/v1/namespaces/' +  k8s_namespace   + '/routes',JSON.stringify(ou_route));
                }
            }
        }

        if (cfg_obj.enable_activemq) {
            deployment_info = k8s.callWS('/apis/apps.openshift.io/v1/namespaces/' + k8s_namespace + "/deploymentconfigs/amq-" + k8s_obj.metadata.name,"",-1);
            if (deployment_info.code == 200) {
                generate_amq_secrets();

                deployment = JSON.parse(deployment_info.data);

                updated_image = update_image_stream(deployment,'amq-' + k8s_obj.metadata.name,cfg_obj.activemq_image);


                if (! updated_image && (amq_secrets_changed || amq_env_secrets_changed)) {
                    


                    patch = {
                        "spec" : {
                            "template" : deployment.spec.template                
                        }
                    };

                    if (patch.spec.template.metadata.annotations == null) {
                        patch.spec.template.metadata.annotations = {};
                    }
                    patch.spec.template.metadata.annotations["tremolo.io/update"] = java.util.UUID.randomUUID().toString();

                    k8s.patchWS('/apis/apps.openshift.io/v1/namespaces/' + k8s_namespace + "/deploymentconfigs/amq-" + k8s_obj.metadata.name,JSON.stringify(patch));
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
}