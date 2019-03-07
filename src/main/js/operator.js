//Called by controller
function on_watch(k8s_event) {
    print("in js : "  + k8s_event);
    event_json = JSON.parse(k8s_event);
    if (event_json["type"] === "ADDED") {
        generate_openunison_secret(event_json);


    } else if (event_json["type"] === "MODIFIED") {

    } else if (event_json["type"] === "DELETED") {

    }
}