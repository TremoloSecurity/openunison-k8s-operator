//Called by controller
function on_watch(k8s_event) {
    print("in js : "  + k8s_event);
    event_json = JSON.parse(k8s_event);
    k8s_obj = event_json['object'];
    cfg_obj = k8s_obj['spec'];
    
    if (event_json["type"] === "ADDED") {

        if (generate_openunison_secret(event_json)) {
        
            if (k8s.isOpenShift()) {

                override_image = System.getenv("RELATED_IMAGE_S2I");

                if (override_image != null) {
                    print("Overriding '" + cfg_obj.openshift.builder_image + "' with '" + override_image + "'");
                    cfg_obj.openshift.builder_image = override_image;
                }


                override_image = System.getenv("RELATED_IMAGE_AMQ");
                    
                if (override_image != null) {
                    print("Overriding '" + cfg_obj.activemq_image + "' with '" + override_image + "'");
                    cfg_obj.activemq_image = override_image;
                }
            }

            if (cfg_obj.run_sql != null) {
                proc_sql();
            }
            
            
            create_static_objects();
            manageCertMgrJob();
            update_workflow_validating_webhook_certificate();
            
            return null;
        } else {
            return "Unable to generate secrets, please check the logs";
        }

        

    } else if (event_json["type"] === "MODIFIED") {
        if (generate_openunison_secret(event_json)) {

            if (k8s.isOpenShift()) {

                override_image = System.getenv("RELATED_IMAGE_S2I");

                if (override_image != null) {
                    print("Overriding '" + cfg_obj.openshift.builder_image + "' with '" + override_image + "'");
                    cfg_obj.openshift.builder_image = override_image;
                }


                override_image = System.getenv("RELATED_IMAGE_AMQ");
                    
                if (override_image != null) {
                    print("Overriding '" + cfg_obj.activemq_image + "' with '" + override_image + "'");
                    cfg_obj.activemq_image = override_image;
                }


                update_openshift_deploymentconfig();
            } else {
                update_k8s_deployment();
            }

            manageCertMgrJob();
            update_workflow_validating_webhook_certificate();
        } else {
            return "Unable to generate secrets, please check the logs";
        }

    } else if (event_json["type"] === "DELETED") {
        delete_k8s_deployment();
        return null;
    }
}