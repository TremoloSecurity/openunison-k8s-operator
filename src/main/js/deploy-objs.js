function generate_amq_secrets() {
    print("generate the amq keystore");

    amqKS = Java.type("java.security.KeyStore").getInstance("PKCS12");
    amqKS.load(null,ksPassword.toCharArray());

    print("trusting the amq client cert");
    amqKS.setCertificateEntry('trusted-amq-client',ouKs.getCertificate('amq-client'));

    secret_response = k8s.callWS("/api/v1/namespaces/" + k8s_namespace + "/secrets/orchestra-amq-server","",-1);

    if (secret_response.code != 200) {
        print("Secret orchestra-amq-server does not exist, make sure it is defined in your openunison custom resource");
        return false;
    } else {
        //store tls secret into keystore
        secret_json = JSON.parse(secret_response.data);
        CertUtils.importKeyPairAndCert(amqKS,ksPassword,"broker",secret_json.data["tls.key"],secret_json.data["tls.crt"]);

        existing_amq_secret = k8s.callWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/amq-secrets-' + k8s_obj.metadata.name,"",-1);

        if (existing_amq_secret.code == 200) {
            print("AMQ is already deployed");
            var existing_amq_secret_json = JSON.parse(existing_amq_secret.data);
            var existing_ks_b64 = existing_amq_secret_json.data["amq.p12"];

            var keystores_same = false;
            var existing_ks = CertUtils.decodeKeystore(existing_ks_b64,ksPassword);

            if (existing_ks != null) {
                keystores_same = CertUtils.keystoresEqual(existing_ks,amqKS,ksPassword);
            }

            if (keystores_same) {
                print("No changes to AMQ secret");
                amq_secrets_changed = false;
            } else {
                secret_patch = {
                    "data":{
                        "amq.p12":CertUtils.encodeKeyStore(amqKS,ksPassword)
                    }
                };

                k8s.patchWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/amq-secrets-' + k8s_obj.metadata.name,JSON.stringify(secret_patch));
                amq_secrets_changed = true;
            }
        } else {
            print("Create activemq config secret");
            amqFileSecrets = {
            "apiVersion":"v1",
                "kind":"Secret",
                "type":"Opaque",
                "metadata": {
                    "name":"amq-secrets-" + k8s_obj.metadata.name,
                },
                "data":{
                "activemq.xml":"PCEtLQogICAgTGljZW5zZWQgdG8gdGhlIEFwYWNoZSBTb2Z0d2FyZSBGb3VuZGF0aW9uIChBU0YpIHVuZGVyIG9uZSBvciBtb3JlCiAgICBjb250cmlidXRvciBsaWNlbnNlIGFncmVlbWVudHMuICBTZWUgdGhlIE5PVElDRSBmaWxlIGRpc3RyaWJ1dGVkIHdpdGgKICAgIHRoaXMgd29yayBmb3IgYWRkaXRpb25hbCBpbmZvcm1hdGlvbiByZWdhcmRpbmcgY29weXJpZ2h0IG93bmVyc2hpcC4KICAgIFRoZSBBU0YgbGljZW5zZXMgdGhpcyBmaWxlIHRvIFlvdSB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wCiAgICAodGhlICJMaWNlbnNlIik7IHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aAogICAgdGhlIExpY2Vuc2UuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXQKCiAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjAKCiAgICBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlCiAgICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiAiQVMgSVMiIEJBU0lTLAogICAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuCiAgICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kCiAgICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS4KLS0+CjwhLS0gU1RBUlQgU05JUFBFVDogZXhhbXBsZSAtLT4KPGJlYW5zCiAgeG1sbnM9Imh0dHA6Ly93d3cuc3ByaW5nZnJhbWV3b3JrLm9yZy9zY2hlbWEvYmVhbnMiCiAgeG1sbnM6eHNpPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxL1hNTFNjaGVtYS1pbnN0YW5jZSIKICB4c2k6c2NoZW1hTG9jYXRpb249Imh0dHA6Ly93d3cuc3ByaW5nZnJhbWV3b3JrLm9yZy9zY2hlbWEvYmVhbnMgaHR0cDovL3d3dy5zcHJpbmdmcmFtZXdvcmsub3JnL3NjaGVtYS9iZWFucy9zcHJpbmctYmVhbnMueHNkCiAgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2NoZW1hL2NvcmUgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2NoZW1hL2NvcmUvYWN0aXZlbXEtY29yZS54c2QiPgoKICAgIDwhLS0gQWxsb3dzIHVzIHRvIHVzZSBzeXN0ZW0gcHJvcGVydGllcyBhcyB2YXJpYWJsZXMgaW4gdGhpcyBjb25maWd1cmF0aW9uIGZpbGUgLS0+CiAgICA8YmVhbiBjbGFzcz0ib3JnLnNwcmluZ2ZyYW1ld29yay5iZWFucy5mYWN0b3J5LmNvbmZpZy5Qcm9wZXJ0eVBsYWNlaG9sZGVyQ29uZmlndXJlciI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImxvY2F0aW9ucyI+CiAgICAgICAgICAgIDx2YWx1ZT5maWxlOiR7YWN0aXZlbXEuY29uZn0vY3JlZGVudGlhbHMucHJvcGVydGllczwvdmFsdWU+CiAgICAgICAgPC9wcm9wZXJ0eT4KICAgIDwvYmVhbj4KCgoKICAgPCEtLSBBbGxvd3MgYWNjZXNzaW5nIHRoZSBzZXJ2ZXIgbG9nIC0tPgogICAgPGJlYW4gaWQ9ImxvZ1F1ZXJ5IiBjbGFzcz0iaW8uZmFicmljOC5pbnNpZ2h0LmxvZy5sb2c0ai5Mb2c0akxvZ1F1ZXJ5IgogICAgICAgICAgbGF6eS1pbml0PSJmYWxzZSIgc2NvcGU9InNpbmdsZXRvbiIKICAgICAgICAgIGluaXQtbWV0aG9kPSJzdGFydCIgZGVzdHJveS1tZXRob2Q9InN0b3AiPgogICAgPC9iZWFuPgoKICAgIDwhLS0KICAgICAgICBUaGUgPGJyb2tlcj4gZWxlbWVudCBpcyB1c2VkIHRvIGNvbmZpZ3VyZSB0aGUgQWN0aXZlTVEgYnJva2VyLgogICAgLS0+CiAgICA8YnJva2VyIHhtbG5zPSJodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9zY2hlbWEvY29yZSIgYnJva2VyTmFtZT0ibG9jYWxob3N0IiBkYXRhRGlyZWN0b3J5PSIke2FjdGl2ZW1xLmRhdGF9Ij4KCiAgICAgICAgPGRlc3RpbmF0aW9uUG9saWN5PgogICAgICAgICAgICA8cG9saWN5TWFwPgogICAgICAgICAgICAgIDxwb2xpY3lFbnRyaWVzPgogICAgICAgICAgICAgICAgPHBvbGljeUVudHJ5IHRvcGljPSI+IiA+CiAgICAgICAgICAgICAgICAgICAgPCEtLSBUaGUgY29uc3RhbnRQZW5kaW5nTWVzc2FnZUxpbWl0U3RyYXRlZ3kgaXMgdXNlZCB0byBwcmV2ZW50CiAgICAgICAgICAgICAgICAgICAgICAgICBzbG93IHRvcGljIGNvbnN1bWVycyB0byBibG9jayBwcm9kdWNlcnMgYW5kIGFmZmVjdCBvdGhlciBjb25zdW1lcnMKICAgICAgICAgICAgICAgICAgICAgICAgIGJ5IGxpbWl0aW5nIHRoZSBudW1iZXIgb2YgbWVzc2FnZXMgdGhhdCBhcmUgcmV0YWluZWQKICAgICAgICAgICAgICAgICAgICAgICAgIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICAgICAgICAgICAgICAgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2xvdy1jb25zdW1lci1oYW5kbGluZy5odG1sCgogICAgICAgICAgICAgICAgICAgIC0tPgogICAgICAgICAgICAgICAgICA8cGVuZGluZ01lc3NhZ2VMaW1pdFN0cmF0ZWd5PgogICAgICAgICAgICAgICAgICAgIDxjb25zdGFudFBlbmRpbmdNZXNzYWdlTGltaXRTdHJhdGVneSBsaW1pdD0iMTAwMCIvPgogICAgICAgICAgICAgICAgICA8L3BlbmRpbmdNZXNzYWdlTGltaXRTdHJhdGVneT4KICAgICAgICAgICAgICAgIDwvcG9saWN5RW50cnk+CiAgICAgICAgICAgICAgPC9wb2xpY3lFbnRyaWVzPgogICAgICAgICAgICA8L3BvbGljeU1hcD4KICAgICAgICA8L2Rlc3RpbmF0aW9uUG9saWN5PgoKCiAgICAgICAgPCEtLQogICAgICAgICAgICBUaGUgbWFuYWdlbWVudENvbnRleHQgaXMgdXNlZCB0byBjb25maWd1cmUgaG93IEFjdGl2ZU1RIGlzIGV4cG9zZWQgaW4KICAgICAgICAgICAgSk1YLiBCeSBkZWZhdWx0LCBBY3RpdmVNUSB1c2VzIHRoZSBNQmVhbiBzZXJ2ZXIgdGhhdCBpcyBzdGFydGVkIGJ5CiAgICAgICAgICAgIHRoZSBKVk0uIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9qbXguaHRtbAogICAgICAgIC0tPgogICAgICAgIDxtYW5hZ2VtZW50Q29udGV4dD4KICAgICAgICAgICAgPG1hbmFnZW1lbnRDb250ZXh0IGNyZWF0ZUNvbm5lY3Rvcj0iZmFsc2UiLz4KICAgICAgICA8L21hbmFnZW1lbnRDb250ZXh0PgoKICAgICAgICA8IS0tCiAgICAgICAgICAgIENvbmZpZ3VyZSBtZXNzYWdlIHBlcnNpc3RlbmNlIGZvciB0aGUgYnJva2VyLiBUaGUgZGVmYXVsdCBwZXJzaXN0ZW5jZQogICAgICAgICAgICBtZWNoYW5pc20gaXMgdGhlIEthaGFEQiBzdG9yZSAoaWRlbnRpZmllZCBieSB0aGUga2FoYURCIHRhZykuCiAgICAgICAgICAgIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9wZXJzaXN0ZW5jZS5odG1sCiAgICAgICAgLS0+CiAgICAgICAgPHBlcnNpc3RlbmNlQWRhcHRlcj4KICAgICAgIDxqZGJjUGVyc2lzdGVuY2VBZGFwdGVyCiAgICAgICAgICAgIGRhdGFEaXJlY3Rvcnk9IiR7YWN0aXZlbXEuYmFzZX0vZGF0YSIKICAgICAgICAgICAgZGF0YVNvdXJjZT0iI215c3FsLWRzIj4KICAgICAgICAgICAgPHN0YXRlbWVudHM+CiAgICAgICAgICAgICAgICA8c3RhdGVtZW50cyBiaW5hcnlEYXRhVHlwZT0iTUVESVVNQkxPQiIvPgogICAgICAgICAgICA8L3N0YXRlbWVudHM+CiAgICAgICAgPC9qZGJjUGVyc2lzdGVuY2VBZGFwdGVyPgogICAgPC9wZXJzaXN0ZW5jZUFkYXB0ZXI+CgogICAgICAgCgoKICAgICAgICAgIDwhLS0KICAgICAgICAgICAgVGhlIHN5c3RlbVVzYWdlIGNvbnRyb2xzIHRoZSBtYXhpbXVtIGFtb3VudCBvZiBzcGFjZSB0aGUgYnJva2VyIHdpbGwKICAgICAgICAgICAgdXNlIGJlZm9yZSBkaXNhYmxpbmcgY2FjaGluZyBhbmQvb3Igc2xvd2luZyBkb3duIHByb2R1Y2Vycy4gRm9yIG1vcmUgaW5mb3JtYXRpb24sIHNlZToKICAgICAgICAgICAgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvcHJvZHVjZXItZmxvdy1jb250cm9sLmh0bWwKICAgICAgICAgIC0tPgogICAgICAgICAgPHN5c3RlbVVzYWdlPgogICAgICAgICAgICA8c3lzdGVtVXNhZ2U+CiAgICAgICAgICAgICAgICA8bWVtb3J5VXNhZ2U+CiAgICAgICAgICAgICAgICAgICAgPG1lbW9yeVVzYWdlIHBlcmNlbnRPZkp2bUhlYXA9IjcwIiAvPgogICAgICAgICAgICAgICAgPC9tZW1vcnlVc2FnZT4KICAgICAgICAgICAgICAgIDxzdG9yZVVzYWdlPgogICAgICAgICAgICAgICAgICAgIDxzdG9yZVVzYWdlIGxpbWl0PSIyNTYgbWIiLz4KICAgICAgICAgICAgICAgIDwvc3RvcmVVc2FnZT4KICAgICAgICAgICAgICAgIDx0ZW1wVXNhZ2U+CiAgICAgICAgICAgICAgICAgICAgPHRlbXBVc2FnZSBsaW1pdD0iMjU2IG1iIi8+CiAgICAgICAgICAgICAgICA8L3RlbXBVc2FnZT4KICAgICAgICAgICAgPC9zeXN0ZW1Vc2FnZT4KICAgICAgICA8L3N5c3RlbVVzYWdlPgoKICAgICAgICA8IS0tCiAgICAgICAgICAgIFRoZSB0cmFuc3BvcnQgY29ubmVjdG9ycyBleHBvc2UgQWN0aXZlTVEgb3ZlciBhIGdpdmVuIHByb3RvY29sIHRvCiAgICAgICAgICAgIGNsaWVudHMgYW5kIG90aGVyIGJyb2tlcnMuIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9jb25maWd1cmluZy10cmFuc3BvcnRzLmh0bWwKICAgICAgICAtLT4KICAgICAgICAgPHNzbENvbnRleHQ+CiAgICAgICAgICAgIDxzc2xDb250ZXh0CiAgICAgICAgICAgICAgICAgICAga2V5U3RvcmU9Ii9ldGMvYWN0aXZlbXEvYW1xLnAxMiIga2V5U3RvcmVQYXNzd29yZD0iJHtUTFNfS1NfUFdEfSIKICAgICAgICAgICAgICAgICAgICB0cnVzdFN0b3JlPSIvZXRjL2FjdGl2ZW1xL2FtcS5wMTIiIHRydXN0U3RvcmVQYXNzd29yZD0iJHtUTFNfS1NfUFdEfSIgdHJ1c3RTdG9yZVR5cGU9InBrY3MxMiIga2V5U3RvcmVUeXBlPSJwa2NzMTIiLz4KICAgICAgICAgICAgPC9zc2xDb250ZXh0PgogICAgICAgIDx0cmFuc3BvcnRDb25uZWN0b3JzPgogICAgICAgICAgICA8IS0tIERPUyBwcm90ZWN0aW9uLCBsaW1pdCBjb25jdXJyZW50IGNvbm5lY3Rpb25zIHRvIDEwMDAgYW5kIGZyYW1lIHNpemUgdG8gMTAwTUIgLS0+CiAgICAgICAgICAgIDx0cmFuc3BvcnRDb25uZWN0b3IgbmFtZT0ib3BlbndpcmUiIHVyaT0ic3NsOi8vMC4wLjAuMDo2MTYxNj9tYXhpbXVtQ29ubmVjdGlvbnM9MTAwMCZhbXA7d2lyZUZvcm1hdC5tYXhGcmFtZVNpemU9MTA0ODU3NjAwJmFtcDtuZWVkQ2xpZW50QXV0aD10cnVlIi8+CiAgICAgICAgPC90cmFuc3BvcnRDb25uZWN0b3JzPgoKICAgICAgICA8IS0tIGRlc3Ryb3kgdGhlIHNwcmluZyBjb250ZXh0IG9uIHNodXRkb3duIHRvIHN0b3AgamV0dHkgLS0+CiAgICAgICAgPHNodXRkb3duSG9va3M+CiAgICAgICAgICAgIDxiZWFuIHhtbG5zPSJodHRwOi8vd3d3LnNwcmluZ2ZyYW1ld29yay5vcmcvc2NoZW1hL2JlYW5zIiBjbGFzcz0ib3JnLmFwYWNoZS5hY3RpdmVtcS5ob29rcy5TcHJpbmdDb250ZXh0SG9vayIgLz4KICAgICAgICA8L3NodXRkb3duSG9va3M+CgogICAgPC9icm9rZXI+CgogICAgPCEtLQogICAgICAgIEVuYWJsZSB3ZWIgY29uc29sZXMsIFJFU1QgYW5kIEFqYXggQVBJcyBhbmQgZGVtb3MKICAgICAgICBUaGUgd2ViIGNvbnNvbGVzIHJlcXVpcmVzIGJ5IGRlZmF1bHQgbG9naW4sIHlvdSBjYW4gZGlzYWJsZSB0aGlzIGluIHRoZSBqZXR0eS54bWwgZmlsZQoKICAgICAgICBUYWtlIGEgbG9vayBhdCAke0FDVElWRU1RX0hPTUV9L2NvbmYvamV0dHkueG1sIGZvciBtb3JlIGRldGFpbHMKICAgIC0tPgogICAgPCEtLSA8aW1wb3J0IHJlc291cmNlPSJmaWxlOi8vL3Vzci9sb2NhbC9hY3RpdmVtcS9jb25mL2pldHR5LnhtbCIvPiAtLT4KICAgIDxiZWFuIGlkPSJzZWN1cml0eUxvZ2luU2VydmljZSIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlY3VyaXR5Lkhhc2hMb2dpblNlcnZpY2UiPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJuYW1lIiB2YWx1ZT0iQWN0aXZlTVFSZWFsbSIgLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0iY29uZmlnIiB2YWx1ZT0iJHthY3RpdmVtcS5jb25mfS9qZXR0eS1yZWFsbS5wcm9wZXJ0aWVzIiAvPgogICAgPC9iZWFuPgoKICAgIDxiZWFuIGlkPSJzZWN1cml0eUNvbnN0cmFpbnQiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS51dGlsLnNlY3VyaXR5LkNvbnN0cmFpbnQiPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJuYW1lIiB2YWx1ZT0iQkFTSUMiIC8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9InJvbGVzIiB2YWx1ZT0idXNlcixhZG1pbiIgLz4KICAgICAgICA8IS0tIHNldCBhdXRoZW50aWNhdGU9ZmFsc2UgdG8gZGlzYWJsZSBsb2dpbiAtLT4KICAgICAgICA8cHJvcGVydHkgbmFtZT0iYXV0aGVudGljYXRlIiB2YWx1ZT0iZmFsc2UiIC8+CiAgICA8L2JlYW4+CiAgICA8YmVhbiBpZD0iYWRtaW5TZWN1cml0eUNvbnN0cmFpbnQiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS51dGlsLnNlY3VyaXR5LkNvbnN0cmFpbnQiPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJuYW1lIiB2YWx1ZT0iQkFTSUMiIC8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9InJvbGVzIiB2YWx1ZT0iYWRtaW4iIC8+CiAgICAgICAgIDwhLS0gc2V0IGF1dGhlbnRpY2F0ZT1mYWxzZSB0byBkaXNhYmxlIGxvZ2luIC0tPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJhdXRoZW50aWNhdGUiIHZhbHVlPSJmYWxzZSIgLz4KICAgIDwvYmVhbj4KICAgIDxiZWFuIGlkPSJzZWN1cml0eUNvbnN0cmFpbnRNYXBwaW5nIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VjdXJpdHkuQ29uc3RyYWludE1hcHBpbmciPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJjb25zdHJhaW50IiByZWY9InNlY3VyaXR5Q29uc3RyYWludCIgLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icGF0aFNwZWMiIHZhbHVlPSIvYXBpLyosL2FkbWluLyosKi5qc3AiIC8+CiAgICA8L2JlYW4+CiAgICA8YmVhbiBpZD0iYWRtaW5TZWN1cml0eUNvbnN0cmFpbnRNYXBwaW5nIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VjdXJpdHkuQ29uc3RyYWludE1hcHBpbmciPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJjb25zdHJhaW50IiByZWY9ImFkbWluU2VjdXJpdHlDb25zdHJhaW50IiAvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJwYXRoU3BlYyIgdmFsdWU9IiouYWN0aW9uIiAvPgogICAgPC9iZWFuPgogICAgCiAgICA8YmVhbiBpZD0icmV3cml0ZUhhbmRsZXIiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5yZXdyaXRlLmhhbmRsZXIuUmV3cml0ZUhhbmRsZXIiPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJydWxlcyI+CiAgICAgICAgICAgIDxsaXN0PgogICAgICAgICAgICAgICAgPGJlYW4gaWQ9ImhlYWRlciIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnJld3JpdGUuaGFuZGxlci5IZWFkZXJQYXR0ZXJuUnVsZSI+CiAgICAgICAgICAgICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJwYXR0ZXJuIiB2YWx1ZT0iKiIvPgogICAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0ibmFtZSIgdmFsdWU9IlgtRlJBTUUtT1BUSU9OUyIvPgogICAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0idmFsdWUiIHZhbHVlPSJTQU1FT1JJR0lOIi8+CiAgICAgICAgICAgICAgICA8L2JlYW4+CiAgICAgICAgICAgIDwvbGlzdD4KICAgICAgICA8L3Byb3BlcnR5PgogICAgPC9iZWFuPgogICAgCgk8YmVhbiBpZD0ic2VjSGFuZGxlckNvbGxlY3Rpb24iIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZXJ2ZXIuaGFuZGxlci5IYW5kbGVyQ29sbGVjdGlvbiI+CgkJPHByb3BlcnR5IG5hbWU9ImhhbmRsZXJzIj4KCQkJPGxpc3Q+CiAgIAkgICAgICAgICAgICA8cmVmIGJlYW49InJld3JpdGVIYW5kbGVyIi8+CgkJCQk8YmVhbiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkud2ViYXBwLldlYkFwcENvbnRleHQiPgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJjb250ZXh0UGF0aCIgdmFsdWU9Ii9hZG1pbiIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0icmVzb3VyY2VCYXNlIiB2YWx1ZT0iJHthY3RpdmVtcS5ob21lfS93ZWJhcHBzL2FkbWluIiAvPgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJsb2dVcmxPblN0YXJ0IiB2YWx1ZT0idHJ1ZSIgLz4KCQkJCTwvYmVhbj4KCQkJCTxiZWFuIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS53ZWJhcHAuV2ViQXBwQ29udGV4dCI+CgkJCQkJPHByb3BlcnR5IG5hbWU9ImNvbnRleHRQYXRoIiB2YWx1ZT0iL2FwaSIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0icmVzb3VyY2VCYXNlIiB2YWx1ZT0iJHthY3RpdmVtcS5ob21lfS93ZWJhcHBzL2FwaSIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0ibG9nVXJsT25TdGFydCIgdmFsdWU9InRydWUiIC8+CgkJCQk8L2JlYW4+CgkJCQk8YmVhbiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLmhhbmRsZXIuUmVzb3VyY2VIYW5kbGVyIj4KCQkJCQk8cHJvcGVydHkgbmFtZT0iZGlyZWN0b3JpZXNMaXN0ZWQiIHZhbHVlPSJmYWxzZSIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0id2VsY29tZUZpbGVzIj4KCQkJCQkJPGxpc3Q+CgkJCQkJCQk8dmFsdWU+aW5kZXguaHRtbDwvdmFsdWU+CgkJCQkJCTwvbGlzdD4KCQkJCQk8L3Byb3BlcnR5PgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJyZXNvdXJjZUJhc2UiIHZhbHVlPSIke2FjdGl2ZW1xLmhvbWV9L3dlYmFwcHMvIiAvPgoJCQkJPC9iZWFuPgoJCQkJPGJlYW4gaWQ9ImRlZmF1bHRIYW5kbGVyIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLmhhbmRsZXIuRGVmYXVsdEhhbmRsZXIiPgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJzZXJ2ZUljb24iIHZhbHVlPSJmYWxzZSIgLz4KCQkJCTwvYmVhbj4KCQkJPC9saXN0PgoJCTwvcHJvcGVydHk+Cgk8L2JlYW4+ICAgIAogICAgPGJlYW4gaWQ9InNlY3VyaXR5SGFuZGxlciIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlY3VyaXR5LkNvbnN0cmFpbnRTZWN1cml0eUhhbmRsZXIiPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJsb2dpblNlcnZpY2UiIHJlZj0ic2VjdXJpdHlMb2dpblNlcnZpY2UiIC8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImF1dGhlbnRpY2F0b3IiPgogICAgICAgICAgICA8YmVhbiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VjdXJpdHkuYXV0aGVudGljYXRpb24uQmFzaWNBdXRoZW50aWNhdG9yIiAvPgogICAgICAgIDwvcHJvcGVydHk+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImNvbnN0cmFpbnRNYXBwaW5ncyI+CiAgICAgICAgICAgIDxsaXN0PgogICAgICAgICAgICAgICAgPHJlZiBiZWFuPSJhZG1pblNlY3VyaXR5Q29uc3RyYWludE1hcHBpbmciIC8+CiAgICAgICAgICAgICAgICA8cmVmIGJlYW49InNlY3VyaXR5Q29uc3RyYWludE1hcHBpbmciIC8+CiAgICAgICAgICAgIDwvbGlzdD4KICAgICAgICA8L3Byb3BlcnR5PgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJoYW5kbGVyIiByZWY9InNlY0hhbmRsZXJDb2xsZWN0aW9uIiAvPgogICAgPC9iZWFuPgoKICAgIDxiZWFuIGlkPSJjb250ZXh0cyIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlcnZlci5oYW5kbGVyLkNvbnRleHRIYW5kbGVyQ29sbGVjdGlvbiI+CiAgICA8L2JlYW4+CgogIDwhLS0gIDxiZWFuIGlkPSJqZXR0eVBvcnQiIGNsYXNzPSJvcmcuYXBhY2hlLmFjdGl2ZW1xLndlYi5XZWJDb25zb2xlUG9ydCIgaW5pdC1tZXRob2Q9InN0YXJ0Ij4KICAgICAgICAgICAgCiAgICAgICAgPHByb3BlcnR5IG5hbWU9Imhvc3QiIHZhbHVlPSIwLjAuMC4wIi8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9InBvcnQiIHZhbHVlPSI4MTYxIi8+CiAgICA8L2JlYW4gLS0+CgogICAgPGJlYW4gaWQ9IlNlcnZlciIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlcnZlci5TZXJ2ZXIiCiAgICAgICAgZGVzdHJveS1tZXRob2Q9InN0b3AiPgoKICAgICAgICA8cHJvcGVydHkgbmFtZT0iaGFuZGxlciI+CiAgICAgICAgICAgIDxiZWFuIGlkPSJoYW5kbGVycyIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlcnZlci5oYW5kbGVyLkhhbmRsZXJDb2xsZWN0aW9uIj4KICAgICAgICAgICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJoYW5kbGVycyI+CiAgICAgICAgICAgICAgICAgICAgPGxpc3Q+CiAgICAgICAgICAgICAgICAgICAgICAgIDxyZWYgYmVhbj0iY29udGV4dHMiIC8+CiAgICAgICAgICAgICAgICAgICAgICAgIDxyZWYgYmVhbj0ic2VjdXJpdHlIYW5kbGVyIiAvPgogICAgICAgICAgICAgICAgICAgIDwvbGlzdD4KICAgICAgICAgICAgICAgIDwvcHJvcGVydHk+CiAgICAgICAgICAgIDwvYmVhbj4KICAgICAgICA8L3Byb3BlcnR5PgoKICAgIDwvYmVhbj4KCiAgICAKCiAgICA8YmVhbiBpZD0iaW52b2tlQ29ubmVjdG9ycyIgY2xhc3M9Im9yZy5zcHJpbmdmcmFtZXdvcmsuYmVhbnMuZmFjdG9yeS5jb25maWcuTWV0aG9kSW52b2tpbmdGYWN0b3J5QmVhbiI+CiAgICAJPHByb3BlcnR5IG5hbWU9InRhcmdldE9iamVjdCIgcmVmPSJTZXJ2ZXIiIC8+CiAgICAJPHByb3BlcnR5IG5hbWU9InRhcmdldE1ldGhvZCIgdmFsdWU9InNldENvbm5lY3RvcnMiIC8+CiAgICAJPHByb3BlcnR5IG5hbWU9ImFyZ3VtZW50cyI+CiAgICAJPGxpc3Q+CiAgICAgICAgICAgCTxiZWFuIGlkPSJDb25uZWN0b3IiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZXJ2ZXIuU2VydmVyQ29ubmVjdG9yIj4KICAgICAgICAgICAJCTxjb25zdHJ1Y3Rvci1hcmcgcmVmPSJTZXJ2ZXIiIC8+CiAgICAgICAgICAgICAgICAgICAgPCEtLSBzZWUgdGhlIGpldHR5UG9ydCBiZWFuIC0tPgogICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9Imhvc3QiIHZhbHVlPSIxMjcuMC4wLjEiIC8+CiAgICAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0icG9ydCIgdmFsdWU9IjgxNjEiIC8+CiAgICAgICAgICAgICAgIDwvYmVhbj4KICAgICAgICAgICAgICAgIDwhLS0KICAgICAgICAgICAgICAgICAgICBFbmFibGUgdGhpcyBjb25uZWN0b3IgaWYgeW91IHdpc2ggdG8gdXNlIGh0dHBzIHdpdGggd2ViIGNvbnNvbGUKICAgICAgICAgICAgICAgIC0tPgogICAgICAgICAgICAgICAgPGJlYW4gaWQ9IlNlY3VyZUNvbm5lY3RvciIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlcnZlci5TZXJ2ZXJDb25uZWN0b3IiPgoJCQkJCTxjb25zdHJ1Y3Rvci1hcmcgcmVmPSJTZXJ2ZXIiIC8+CgkJCQkJPGNvbnN0cnVjdG9yLWFyZz4KCQkJCQkJPGJlYW4gaWQ9ImhhbmRsZXJzIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkudXRpbC5zc2wuU3NsQ29udGV4dEZhY3RvcnkiPgoJCQkJCQkKCQkJCQkJCTxwcm9wZXJ0eSBuYW1lPSJrZXlTdG9yZVBhdGgiIHZhbHVlPSIvZXRjL2FjdGl2ZW1xL2FtcS5wMTIiIC8+CgkJCQkJCQk8cHJvcGVydHkgbmFtZT0ia2V5U3RvcmVQYXNzd29yZCIgdmFsdWU9IiR7VExTX0tTX1BXRH0iIC8+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0ia2V5U3RvcmVUeXBlIiB2YWx1ZT0icGtjczEyIiAvPgoKICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJ0cnVzdFN0b3JlUGF0aCIgdmFsdWU9Ii9ldGMvYWN0aXZlbXEvYW1xLnAxMiIgLz4KCQkJCQkJCTxwcm9wZXJ0eSBuYW1lPSJ0cnVzdFN0b3JlUGFzc3dvcmQiIHZhbHVlPSIke1RMU19LU19QV0R9IiAvPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9InRydXN0U3RvcmVUeXBlIiB2YWx1ZT0icGtjczEyIiAvPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9Im5lZWRDbGllbnRBdXRoIiB2YWx1ZT0idHJ1ZSIgLz4KCgkJCQkJCTwvYmVhbj4KCQkJCQk8L2NvbnN0cnVjdG9yLWFyZz4KCQkJCQk8cHJvcGVydHkgbmFtZT0icG9ydCIgdmFsdWU9IjgxNjIiIC8+CgkJCQk8L2JlYW4+CiAgICAgICAgICAgIDwvbGlzdD4KICAgIAk8L3Byb3BlcnR5PgogICAgPC9iZWFuPgoKCTxiZWFuIGlkPSJjb25maWd1cmVKZXR0eSIgY2xhc3M9Im9yZy5zcHJpbmdmcmFtZXdvcmsuYmVhbnMuZmFjdG9yeS5jb25maWcuTWV0aG9kSW52b2tpbmdGYWN0b3J5QmVhbiI+CgkJPHByb3BlcnR5IG5hbWU9InN0YXRpY01ldGhvZCIgdmFsdWU9Im9yZy5hcGFjaGUuYWN0aXZlbXEud2ViLmNvbmZpZy5Kc3BDb25maWd1cmVyLmNvbmZpZ3VyZUpldHR5IiAvPgoJCTxwcm9wZXJ0eSBuYW1lPSJhcmd1bWVudHMiPgoJCQk8bGlzdD4KCQkJCTxyZWYgYmVhbj0iU2VydmVyIiAvPgoJCQkJPHJlZiBiZWFuPSJzZWNIYW5kbGVyQ29sbGVjdGlvbiIgLz4KCQkJPC9saXN0PgoJCTwvcHJvcGVydHk+Cgk8L2JlYW4+CiAgICAKICAgIDxiZWFuIGlkPSJpbnZva2VTdGFydCIgY2xhc3M9Im9yZy5zcHJpbmdmcmFtZXdvcmsuYmVhbnMuZmFjdG9yeS5jb25maWcuTWV0aG9kSW52b2tpbmdGYWN0b3J5QmVhbiIgCiAgICAJZGVwZW5kcy1vbj0iY29uZmlndXJlSmV0dHksIGludm9rZUNvbm5lY3RvcnMiPgogICAgCTxwcm9wZXJ0eSBuYW1lPSJ0YXJnZXRPYmplY3QiIHJlZj0iU2VydmVyIiAvPgogICAgCTxwcm9wZXJ0eSBuYW1lPSJ0YXJnZXRNZXRob2QiIHZhbHVlPSJzdGFydCIgLz4gIAkKICAgIDwvYmVhbj4KCiAgICAgICAgPCEtLSBzZXR1cCBteXNxbCBhY2Nlc3MgLS0+CiAgICA8YmVhbiBpZD0ibXlzcWwtZHMiIGNsYXNzPSJvcmcuYXBhY2hlLmNvbW1vbnMuZGJjcC5CYXNpY0RhdGFTb3VyY2UiIGRlc3Ryb3ktbWV0aG9kPSJjbG9zZSI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImRyaXZlckNsYXNzTmFtZSIgdmFsdWU9IiN7c3lzdGVtRW52aXJvbm1lbnRbJ0pEQkNfRFJJVkVSJ119Ii8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9InVybCIgdmFsdWU9IiR7SkRCQ19VUkx9Ii8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9InVzZXJuYW1lIiB2YWx1ZT0iI3tzeXN0ZW1FbnZpcm9ubWVudFsnSkRCQ19VU0VSJ119Ii8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9InBhc3N3b3JkIiB2YWx1ZT0iI3tzeXN0ZW1FbnZpcm9ubWVudFsnSkRCQ19QQVNTV09SRCddfSIvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJwb29sUHJlcGFyZWRTdGF0ZW1lbnRzIiB2YWx1ZT0idHJ1ZSIvPgogICAgPC9iZWFuPgoKPC9iZWFucz4KPCEtLSBFTkQgU05JUFBFVDogZXhhbXBsZSAtLT4=",
                "amq.p12":CertUtils.encodeKeyStore(amqKS,ksPassword)
                }
            }

            k8s.postWS('/api/v1/namespaces/' + k8s_namespace + '/secrets',JSON.stringify(amqFileSecrets));

        }

        print("Create activemq env var secret");

        string_for_hash = inProp['OU_JDBC_DRIVER'] + inProp['OU_JDBC_URL'] + inProp['OU_JDBC_USER'] + inProp['OU_JDBC_PASSWORD'] + ksPassword;
        bytes_for_hash = string_for_hash.getBytes("UTF-8");

        digest = java.security.MessageDigest.getInstance("SHA-256");
        digest.update(bytes_for_hash,0,bytes_for_hash.length);
        digest_bytes = digest.digest();
        digest_base64 = java.util.Base64.getEncoder().encodeToString(digest_bytes);

        existing_amq_secret = k8s.callWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/amq-env-secrets-' + k8s_obj.metadata.name,"",-1);

        if (existing_amq_secret.code == 200) {
            var existing_amq_secret_data = JSON.parse(existing_amq_secret.data);
            

            digest_from_secret = null;
            
            if (existing_amq_secret_data.metadata["annotations"] != null) {
                digest_from_secret = existing_amq_secret_data.metadata.annotations["tremolo.io/digest"];
            }

            if (digest_from_secret !== digest_base64) {
                secret_patch = {
                    "metadata": {
                        "annotations":{
                            "tremolo.io/digest": digest_base64
                        }
                    },
                    "data":{
                        "JDBC_DRIVER":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_DRIVER'].getBytes("UTF-8")),
                        "JDBC_URL":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_URL'].getBytes("UTF-8")),
                        "JDBC_USER":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_USER'].getBytes("UTF-8")),
                        "JDBC_PASSWORD":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_PASSWORD'].getBytes("UTF-8")),
                        "TLS_KS_PWD":java.util.Base64.getEncoder().encodeToString(ksPassword.getBytes("UTF-8"))
                    }
                };

                print("Updating amq env vars secret");
                k8s.patchWS('/api/v1/namespaces/' + k8s_namespace + '/secrets/amq-env-secrets-' + k8s_obj.metadata.name,JSON.stringify(secret_patch));
                amq_env_secrets_changed = true;
            } else {
                print("No updates to amq env vars secret");
                amq_env_secrets_changed = false;
            }
        } else {

            amqEnvSecrets = {
            "apiVersion":"v1",
                "kind":"Secret",
                "type":"Opaque",
                "metadata": {
                    "name":"amq-env-secrets-" + k8s_obj.metadata.name,
                    "annotations":{
                        "tremolo.io/digest": digest_base64
                    }
                },
                "data":{
                "JDBC_DRIVER":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_DRIVER'].getBytes("UTF-8")),
                "JDBC_URL":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_URL'].getBytes("UTF-8")),
                "JDBC_USER":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_USER'].getBytes("UTF-8")),
                "JDBC_PASSWORD":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_PASSWORD'].getBytes("UTF-8")),
                "TLS_KS_PWD":java.util.Base64.getEncoder().encodeToString(ksPassword.getBytes("UTF-8"))
                }
            }

            k8s.postWS('/api/v1/namespaces/' + k8s_namespace + '/secrets',JSON.stringify(amqEnvSecrets));

        }

        return true;
    }
}
function create_activemq() {
    if (! secret_data_changed) {
        print("No changes to the secrets, no need to redeploy");
        return;
    }

    if (! generate_amq_secrets()) {
        return;
    }


        
        amq_service = {
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {
                "labels": {
                    "app": "amq",
                    "operated-by": "openunison-operator"
                },
                "name": "amq",
                "namespace": k8s_namespace
            },
            "spec": {
                "ports": [
                    {
                        "name": "amq-openwire",
                        "port": 61616,
                        "protocol": "TCP",
                        "targetPort": 61616
                    },
                    {
                        "name": "amq-admin",
                        "port": 8162,
                        "protocol": "TCP",
                        "targetPort": 8162
                    }
                ],
                "selector": {
                    "app": "amq-" + k8s_obj.metadata.name
                },
                "sessionAffinity": "ClientIP",
                "sessionAffinityConfig": {
                    "clientIP": {
                        "timeoutSeconds": 10800
                    }
                },
                "type": "ClusterIP"
            }
        };

        k8s.postWS('/api/v1/namespaces/' + k8s_namespace + '/services',JSON.stringify(amq_service));


        if (k8s.isOpenShift()) {
            deploy_amq_openshift();
        } else {
            deploy_k8s_activemq();
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

    

    

    obj = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "labels": {
                "app": "openunison-" + k8s_obj.metadata.name,
                "operated-by": "openunison-operator"
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
                "application": "openunison-" + k8s_obj.metadata.name
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

    if (k8s.isOpenShift()) {
        deploy_openshift_objects();
    } else {
        create_ingress_objects();
        create_k8s_deployment();
    }

    if (cfg_obj.enable_activemq) {
        create_activemq();
    }
    
}