//Called by controller
function on_watch(k8s_event) {
    print("in js : "  + k8s_event);
    event_json = JSON.parse(k8s_event);
    k8s_obj = event_json['object'];
    cfg_obj = k8s_obj['spec'];
    
    if (event_json["type"] === "ADDED") {

        generate_openunison_secret(event_json);
        
        if (cfg_obj.run_sql != null) {
            proc_sql();
        }
        
        
        create_static_objects();

        

    } else if (event_json["type"] === "MODIFIED") {
        generate_openunison_secret(event_json);

        if (k8s.isOpenShift()) {
            update_openshift_deploymentconfig();
        } else {
            update_k8s_deployment();
        }
        

    } else if (event_json["type"] === "DELETED") {
        delete_k8s_deployment();
    }
}