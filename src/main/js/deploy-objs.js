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
                "activemq.xml":"PCEtLQogICAgTGljZW5zZWQgdG8gdGhlIEFwYWNoZSBTb2Z0d2FyZSBGb3VuZGF0aW9uIChBU0YpIHVuZGVyIG9uZSBvciBtb3JlCiAgICBjb250cmlidXRvciBsaWNlbnNlIGFncmVlbWVudHMuICBTZWUgdGhlIE5PVElDRSBmaWxlIGRpc3RyaWJ1dGVkIHdpdGgKICAgIHRoaXMgd29yayBmb3IgYWRkaXRpb25hbCBpbmZvcm1hdGlvbiByZWdhcmRpbmcgY29weXJpZ2h0IG93bmVyc2hpcC4KICAgIFRoZSBBU0YgbGljZW5zZXMgdGhpcyBmaWxlIHRvIFlvdSB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wCiAgICAodGhlICJMaWNlbnNlIik7IHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aAogICAgdGhlIExpY2Vuc2UuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXQKCiAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjAKCiAgICBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlCiAgICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiAiQVMgSVMiIEJBU0lTLAogICAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuCiAgICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kCiAgICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS4KLS0+CjwhLS0gU1RBUlQgU05JUFBFVDogZXhhbXBsZSAtLT4KPGJlYW5zCiAgeG1sbnM9Imh0dHA6Ly93d3cuc3ByaW5nZnJhbWV3b3JrLm9yZy9zY2hlbWEvYmVhbnMiCiAgeG1sbnM6eHNpPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxL1hNTFNjaGVtYS1pbnN0YW5jZSIKICB4c2k6c2NoZW1hTG9jYXRpb249Imh0dHA6Ly93d3cuc3ByaW5nZnJhbWV3b3JrLm9yZy9zY2hlbWEvYmVhbnMgaHR0cDovL3d3dy5zcHJpbmdmcmFtZXdvcmsub3JnL3NjaGVtYS9iZWFucy9zcHJpbmctYmVhbnMueHNkCiAgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2NoZW1hL2NvcmUgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2NoZW1hL2NvcmUvYWN0aXZlbXEtY29yZS54c2QiPgoKCgoKICAgIDwhLS0gQWxsb3dzIHVzIHRvIHVzZSBzeXN0ZW0gcHJvcGVydGllcyBhcyB2YXJpYWJsZXMgaW4gdGhpcyBjb25maWd1cmF0aW9uIGZpbGUgLS0+CiAgICA8YmVhbiBjbGFzcz0ib3JnLnNwcmluZ2ZyYW1ld29yay5iZWFucy5mYWN0b3J5LmNvbmZpZy5Qcm9wZXJ0eVBsYWNlaG9sZGVyQ29uZmlndXJlciI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImxvY2F0aW9ucyI+CiAgICAgICAgICAgIDx2YWx1ZT5maWxlOiR7YWN0aXZlbXEuY29uZn0vY3JlZGVudGlhbHMucHJvcGVydGllczwvdmFsdWU+CiAgICAgICAgPC9wcm9wZXJ0eT4KICAgIDwvYmVhbj4KCgoKICAgPCEtLSBBbGxvd3MgYWNjZXNzaW5nIHRoZSBzZXJ2ZXIgbG9nIC0tPgogICAgPGJlYW4gaWQ9ImxvZ1F1ZXJ5IiBjbGFzcz0iaW8uZmFicmljOC5pbnNpZ2h0LmxvZy5sb2c0ai5Mb2c0akxvZ1F1ZXJ5IgogICAgICAgICAgbGF6eS1pbml0PSJmYWxzZSIgc2NvcGU9InNpbmdsZXRvbiIKICAgICAgICAgIGluaXQtbWV0aG9kPSJzdGFydCIgZGVzdHJveS1tZXRob2Q9InN0b3AiPgogICAgPC9iZWFuPgoKICAgIDwhLS0KICAgICAgICBUaGUgPGJyb2tlcj4gZWxlbWVudCBpcyB1c2VkIHRvIGNvbmZpZ3VyZSB0aGUgQWN0aXZlTVEgYnJva2VyLgogICAgLS0+CiAgICA8YnJva2VyIHhtbG5zPSJodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9zY2hlbWEvY29yZSIgYnJva2VyTmFtZT0ibG9jYWxob3N0IiBkYXRhRGlyZWN0b3J5PSIke2FjdGl2ZW1xLmRhdGF9Ij4KCiAgICAgICAgPGRlc3RpbmF0aW9uUG9saWN5PgogICAgICAgICAgICA8cG9saWN5TWFwPgogICAgICAgICAgICAgIDxwb2xpY3lFbnRyaWVzPgogICAgICAgICAgICAgICAgPHBvbGljeUVudHJ5IHRvcGljPSI+IiA+CiAgICAgICAgICAgICAgICAgICAgPCEtLSBUaGUgY29uc3RhbnRQZW5kaW5nTWVzc2FnZUxpbWl0U3RyYXRlZ3kgaXMgdXNlZCB0byBwcmV2ZW50CiAgICAgICAgICAgICAgICAgICAgICAgICBzbG93IHRvcGljIGNvbnN1bWVycyB0byBibG9jayBwcm9kdWNlcnMgYW5kIGFmZmVjdCBvdGhlciBjb25zdW1lcnMKICAgICAgICAgICAgICAgICAgICAgICAgIGJ5IGxpbWl0aW5nIHRoZSBudW1iZXIgb2YgbWVzc2FnZXMgdGhhdCBhcmUgcmV0YWluZWQKICAgICAgICAgICAgICAgICAgICAgICAgIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICAgICAgICAgICAgICAgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2xvdy1jb25zdW1lci1oYW5kbGluZy5odG1sCgogICAgICAgICAgICAgICAgICAgIC0tPgogICAgICAgICAgICAgICAgICA8cGVuZGluZ01lc3NhZ2VMaW1pdFN0cmF0ZWd5PgogICAgICAgICAgICAgICAgICAgIDxjb25zdGFudFBlbmRpbmdNZXNzYWdlTGltaXRTdHJhdGVneSBsaW1pdD0iMTAwMCIvPgogICAgICAgICAgICAgICAgICA8L3BlbmRpbmdNZXNzYWdlTGltaXRTdHJhdGVneT4KICAgICAgICAgICAgICAgIDwvcG9saWN5RW50cnk+CiAgICAgICAgICAgICAgPC9wb2xpY3lFbnRyaWVzPgogICAgICAgICAgICA8L3BvbGljeU1hcD4KICAgICAgICA8L2Rlc3RpbmF0aW9uUG9saWN5PgoKCiAgICAgICAgPCEtLQogICAgICAgICAgICBUaGUgbWFuYWdlbWVudENvbnRleHQgaXMgdXNlZCB0byBjb25maWd1cmUgaG93IEFjdGl2ZU1RIGlzIGV4cG9zZWQgaW4KICAgICAgICAgICAgSk1YLiBCeSBkZWZhdWx0LCBBY3RpdmVNUSB1c2VzIHRoZSBNQmVhbiBzZXJ2ZXIgdGhhdCBpcyBzdGFydGVkIGJ5CiAgICAgICAgICAgIHRoZSBKVk0uIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9qbXguaHRtbAogICAgICAgIC0tPgogICAgICAgIDxtYW5hZ2VtZW50Q29udGV4dD4KICAgICAgICAgICAgPG1hbmFnZW1lbnRDb250ZXh0IGNyZWF0ZUNvbm5lY3Rvcj0iZmFsc2UiLz4KICAgICAgICA8L21hbmFnZW1lbnRDb250ZXh0PgoKICAgICAgICA8IS0tCiAgICAgICAgICAgIENvbmZpZ3VyZSBtZXNzYWdlIHBlcnNpc3RlbmNlIGZvciB0aGUgYnJva2VyLiBUaGUgZGVmYXVsdCBwZXJzaXN0ZW5jZQogICAgICAgICAgICBtZWNoYW5pc20gaXMgdGhlIEthaGFEQiBzdG9yZSAoaWRlbnRpZmllZCBieSB0aGUga2FoYURCIHRhZykuCiAgICAgICAgICAgIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9wZXJzaXN0ZW5jZS5odG1sCiAgICAgICAgLS0+CiAgICAgICAgPHBlcnNpc3RlbmNlQWRhcHRlcj4KICAgICAgIDxqZGJjUGVyc2lzdGVuY2VBZGFwdGVyCiAgICAgICAgICAgIGRhdGFEaXJlY3Rvcnk9IiR7YWN0aXZlbXEuYmFzZX0vZGF0YSIKICAgICAgICAgICAgZGF0YVNvdXJjZT0iI215c3FsLWRzIj4KICAgICAgICAgICAgPHN0YXRlbWVudHM+CiAgICAgICAgICAgICAgICA8c3RhdGVtZW50cyBiaW5hcnlEYXRhVHlwZT0iTUVESVVNQkxPQiIvPgogICAgICAgICAgICA8L3N0YXRlbWVudHM+CiAgICAgICAgPC9qZGJjUGVyc2lzdGVuY2VBZGFwdGVyPgogICAgPC9wZXJzaXN0ZW5jZUFkYXB0ZXI+CgoKCgogICAgICAgICAgPCEtLQogICAgICAgICAgICBUaGUgc3lzdGVtVXNhZ2UgY29udHJvbHMgdGhlIG1heGltdW0gYW1vdW50IG9mIHNwYWNlIHRoZSBicm9rZXIgd2lsbAogICAgICAgICAgICB1c2UgYmVmb3JlIGRpc2FibGluZyBjYWNoaW5nIGFuZC9vciBzbG93aW5nIGRvd24gcHJvZHVjZXJzLiBGb3IgbW9yZSBpbmZvcm1hdGlvbiwgc2VlOgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9wcm9kdWNlci1mbG93LWNvbnRyb2wuaHRtbAogICAgICAgICAgLS0+CiAgICAgICAgICA8c3lzdGVtVXNhZ2U+CiAgICAgICAgICAgIDxzeXN0ZW1Vc2FnZT4KICAgICAgICAgICAgICAgIDxtZW1vcnlVc2FnZT4KICAgICAgICAgICAgICAgICAgICA8bWVtb3J5VXNhZ2UgcGVyY2VudE9mSnZtSGVhcD0iNzAiIC8+CiAgICAgICAgICAgICAgICA8L21lbW9yeVVzYWdlPgogICAgICAgICAgICAgICAgPHN0b3JlVXNhZ2U+CiAgICAgICAgICAgICAgICAgICAgPHN0b3JlVXNhZ2UgbGltaXQ9IjI1NiBtYiIvPgogICAgICAgICAgICAgICAgPC9zdG9yZVVzYWdlPgogICAgICAgICAgICAgICAgPHRlbXBVc2FnZT4KICAgICAgICAgICAgICAgICAgICA8dGVtcFVzYWdlIGxpbWl0PSIyNTYgbWIiLz4KICAgICAgICAgICAgICAgIDwvdGVtcFVzYWdlPgogICAgICAgICAgICA8L3N5c3RlbVVzYWdlPgogICAgICAgIDwvc3lzdGVtVXNhZ2U+CgogICAgICAgIDwhLS0KICAgICAgICAgICAgVGhlIHRyYW5zcG9ydCBjb25uZWN0b3JzIGV4cG9zZSBBY3RpdmVNUSBvdmVyIGEgZ2l2ZW4gcHJvdG9jb2wgdG8KICAgICAgICAgICAgY2xpZW50cyBhbmQgb3RoZXIgYnJva2Vycy4gRm9yIG1vcmUgaW5mb3JtYXRpb24sIHNlZToKCiAgICAgICAgICAgIGh0dHA6Ly9hY3RpdmVtcS5hcGFjaGUub3JnL2NvbmZpZ3VyaW5nLXRyYW5zcG9ydHMuaHRtbAogICAgICAgIC0tPgogICAgICAgICA8c3NsQ29udGV4dD4KICAgICAgICAgICAgPHNzbENvbnRleHQKICAgICAgICAgICAgICAgICAgICBrZXlTdG9yZT0iL2V0Yy9hY3RpdmVtcS9hbXEucDEyIiBrZXlTdG9yZVBhc3N3b3JkPSIke1RMU19LU19QV0R9IgogICAgICAgICAgICAgICAgICAgIHRydXN0U3RvcmU9Ii9ldGMvYWN0aXZlbXEvYW1xLnAxMiIgdHJ1c3RTdG9yZVBhc3N3b3JkPSIke1RMU19LU19QV0R9IiB0cnVzdFN0b3JlVHlwZT0icGtjczEyIiBrZXlTdG9yZVR5cGU9InBrY3MxMiIvPgogICAgICAgICAgICA8L3NzbENvbnRleHQ+CiAgICAgICAgPHRyYW5zcG9ydENvbm5lY3RvcnM+CiAgICAgICAgICAgIDwhLS0gRE9TIHByb3RlY3Rpb24sIGxpbWl0IGNvbmN1cnJlbnQgY29ubmVjdGlvbnMgdG8gMTAwMCBhbmQgZnJhbWUgc2l6ZSB0byAxMDBNQiAtLT4KICAgICAgICAgICAgPHRyYW5zcG9ydENvbm5lY3RvciBuYW1lPSJvcGVud2lyZSIgdXJpPSJzc2w6Ly8wLjAuMC4wOjYxNjE2P21heGltdW1Db25uZWN0aW9ucz0xMDAwJmFtcDt3aXJlRm9ybWF0Lm1heEZyYW1lU2l6ZT0xMDQ4NTc2MDAmYW1wO25lZWRDbGllbnRBdXRoPXRydWUiLz4KICAgICAgICA8L3RyYW5zcG9ydENvbm5lY3RvcnM+CgogICAgICAgIDwhLS0gZGVzdHJveSB0aGUgc3ByaW5nIGNvbnRleHQgb24gc2h1dGRvd24gdG8gc3RvcCBqZXR0eSAtLT4KICAgICAgICA8c2h1dGRvd25Ib29rcz4KICAgICAgICAgICAgPGJlYW4geG1sbnM9Imh0dHA6Ly93d3cuc3ByaW5nZnJhbWV3b3JrLm9yZy9zY2hlbWEvYmVhbnMiIGNsYXNzPSJvcmcuYXBhY2hlLmFjdGl2ZW1xLmhvb2tzLlNwcmluZ0NvbnRleHRIb29rIiAvPgogICAgICAgIDwvc2h1dGRvd25Ib29rcz4KCiAgICA8L2Jyb2tlcj4KCiAgICA8IS0tCiAgICAgICAgRW5hYmxlIHdlYiBjb25zb2xlcywgUkVTVCBhbmQgQWpheCBBUElzIGFuZCBkZW1vcwogICAgICAgIFRoZSB3ZWIgY29uc29sZXMgcmVxdWlyZXMgYnkgZGVmYXVsdCBsb2dpbiwgeW91IGNhbiBkaXNhYmxlIHRoaXMgaW4gdGhlIGpldHR5LnhtbCBmaWxlCgogICAgICAgIFRha2UgYSBsb29rIGF0ICR7QUNUSVZFTVFfSE9NRX0vY29uZi9qZXR0eS54bWwgZm9yIG1vcmUgZGV0YWlscwogICAgLS0+CiAgICA8IS0tIDxpbXBvcnQgcmVzb3VyY2U9ImZpbGU6Ly8vdXNyL2xvY2FsL2FjdGl2ZW1xL2NvbmYvamV0dHkueG1sIi8+IC0tPgogICAgPGJlYW4gaWQ9InNlY3VyaXR5TG9naW5TZXJ2aWNlIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VjdXJpdHkuSGFzaExvZ2luU2VydmljZSI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9Im5hbWUiIHZhbHVlPSJBY3RpdmVNUVJlYWxtIiAvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJjb25maWciIHZhbHVlPSIke2FjdGl2ZW1xLmNvbmZ9L2pldHR5LXJlYWxtLnByb3BlcnRpZXMiIC8+CiAgICA8L2JlYW4+CgogICAgPGJlYW4gaWQ9InNlY3VyaXR5Q29uc3RyYWludCIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnV0aWwuc2VjdXJpdHkuQ29uc3RyYWludCI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9Im5hbWUiIHZhbHVlPSJCQVNJQyIgLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icm9sZXMiIHZhbHVlPSJ1c2VyLGFkbWluIiAvPgogICAgICAgIDwhLS0gc2V0IGF1dGhlbnRpY2F0ZT1mYWxzZSB0byBkaXNhYmxlIGxvZ2luIC0tPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJhdXRoZW50aWNhdGUiIHZhbHVlPSJmYWxzZSIgLz4KICAgIDwvYmVhbj4KICAgIDxiZWFuIGlkPSJhZG1pblNlY3VyaXR5Q29uc3RyYWludCIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnV0aWwuc2VjdXJpdHkuQ29uc3RyYWludCI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9Im5hbWUiIHZhbHVlPSJCQVNJQyIgLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icm9sZXMiIHZhbHVlPSJhZG1pbiIgLz4KICAgICAgICAgPCEtLSBzZXQgYXV0aGVudGljYXRlPWZhbHNlIHRvIGRpc2FibGUgbG9naW4gLS0+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImF1dGhlbnRpY2F0ZSIgdmFsdWU9ImZhbHNlIiAvPgogICAgPC9iZWFuPgogICAgPGJlYW4gaWQ9InNlY3VyaXR5Q29uc3RyYWludE1hcHBpbmciIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZWN1cml0eS5Db25zdHJhaW50TWFwcGluZyI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImNvbnN0cmFpbnQiIHJlZj0ic2VjdXJpdHlDb25zdHJhaW50IiAvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJwYXRoU3BlYyIgdmFsdWU9Ii9hcGkvKiwvYWRtaW4vKiwqLmpzcCIgLz4KICAgIDwvYmVhbj4KICAgIDxiZWFuIGlkPSJhZG1pblNlY3VyaXR5Q29uc3RyYWludE1hcHBpbmciIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZWN1cml0eS5Db25zdHJhaW50TWFwcGluZyI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImNvbnN0cmFpbnQiIHJlZj0iYWRtaW5TZWN1cml0eUNvbnN0cmFpbnQiIC8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9InBhdGhTcGVjIiB2YWx1ZT0iKi5hY3Rpb24iIC8+CiAgICA8L2JlYW4+CgogICAgPGJlYW4gaWQ9InJld3JpdGVIYW5kbGVyIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkucmV3cml0ZS5oYW5kbGVyLlJld3JpdGVIYW5kbGVyIj4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icnVsZXMiPgogICAgICAgICAgICA8bGlzdD4KICAgICAgICAgICAgICAgIDxiZWFuIGlkPSJoZWFkZXIiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5yZXdyaXRlLmhhbmRsZXIuSGVhZGVyUGF0dGVyblJ1bGUiPgogICAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0icGF0dGVybiIgdmFsdWU9IioiLz4KICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9Im5hbWUiIHZhbHVlPSJYLUZSQU1FLU9QVElPTlMiLz4KICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9InZhbHVlIiB2YWx1ZT0iU0FNRU9SSUdJTiIvPgogICAgICAgICAgICAgICAgPC9iZWFuPgogICAgICAgICAgICA8L2xpc3Q+CiAgICAgICAgPC9wcm9wZXJ0eT4KICAgIDwvYmVhbj4KCgk8YmVhbiBpZD0ic2VjSGFuZGxlckNvbGxlY3Rpb24iIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZXJ2ZXIuaGFuZGxlci5IYW5kbGVyQ29sbGVjdGlvbiI+CgkJPHByb3BlcnR5IG5hbWU9ImhhbmRsZXJzIj4KCQkJPGxpc3Q+CiAgIAkgICAgICAgICAgICA8cmVmIGJlYW49InJld3JpdGVIYW5kbGVyIi8+CgkJCQk8YmVhbiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkud2ViYXBwLldlYkFwcENvbnRleHQiPgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJjb250ZXh0UGF0aCIgdmFsdWU9Ii9hZG1pbiIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0icmVzb3VyY2VCYXNlIiB2YWx1ZT0iJHthY3RpdmVtcS5ob21lfS93ZWJhcHBzL2FkbWluIiAvPgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJsb2dVcmxPblN0YXJ0IiB2YWx1ZT0idHJ1ZSIgLz4KCQkJCTwvYmVhbj4KCQkJCTxiZWFuIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS53ZWJhcHAuV2ViQXBwQ29udGV4dCI+CgkJCQkJPHByb3BlcnR5IG5hbWU9ImNvbnRleHRQYXRoIiB2YWx1ZT0iL2FwaSIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0icmVzb3VyY2VCYXNlIiB2YWx1ZT0iJHthY3RpdmVtcS5ob21lfS93ZWJhcHBzL2FwaSIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0ibG9nVXJsT25TdGFydCIgdmFsdWU9InRydWUiIC8+CgkJCQk8L2JlYW4+CgkJCQk8YmVhbiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLmhhbmRsZXIuUmVzb3VyY2VIYW5kbGVyIj4KCQkJCQk8cHJvcGVydHkgbmFtZT0iZGlyZWN0b3JpZXNMaXN0ZWQiIHZhbHVlPSJmYWxzZSIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0id2VsY29tZUZpbGVzIj4KCQkJCQkJPGxpc3Q+CgkJCQkJCQk8dmFsdWU+aW5kZXguaHRtbDwvdmFsdWU+CgkJCQkJCTwvbGlzdD4KCQkJCQk8L3Byb3BlcnR5PgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJyZXNvdXJjZUJhc2UiIHZhbHVlPSIke2FjdGl2ZW1xLmhvbWV9L3dlYmFwcHMvIiAvPgoJCQkJPC9iZWFuPgoJCQkJPGJlYW4gaWQ9ImRlZmF1bHRIYW5kbGVyIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLmhhbmRsZXIuRGVmYXVsdEhhbmRsZXIiPgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJzZXJ2ZUljb24iIHZhbHVlPSJmYWxzZSIgLz4KCQkJCTwvYmVhbj4KCQkJPC9saXN0PgoJCTwvcHJvcGVydHk+Cgk8L2JlYW4+CiAgICA8YmVhbiBpZD0ic2VjdXJpdHlIYW5kbGVyIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VjdXJpdHkuQ29uc3RyYWludFNlY3VyaXR5SGFuZGxlciI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImxvZ2luU2VydmljZSIgcmVmPSJzZWN1cml0eUxvZ2luU2VydmljZSIgLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0iYXV0aGVudGljYXRvciI+CiAgICAgICAgICAgIDxiZWFuIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZWN1cml0eS5hdXRoZW50aWNhdGlvbi5CYXNpY0F1dGhlbnRpY2F0b3IiIC8+CiAgICAgICAgPC9wcm9wZXJ0eT4KICAgICAgICA8cHJvcGVydHkgbmFtZT0iY29uc3RyYWludE1hcHBpbmdzIj4KICAgICAgICAgICAgPGxpc3Q+CiAgICAgICAgICAgICAgICA8cmVmIGJlYW49ImFkbWluU2VjdXJpdHlDb25zdHJhaW50TWFwcGluZyIgLz4KICAgICAgICAgICAgICAgIDxyZWYgYmVhbj0ic2VjdXJpdHlDb25zdHJhaW50TWFwcGluZyIgLz4KICAgICAgICAgICAgPC9saXN0PgogICAgICAgIDwvcHJvcGVydHk+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImhhbmRsZXIiIHJlZj0ic2VjSGFuZGxlckNvbGxlY3Rpb24iIC8+CiAgICA8L2JlYW4+CgogICAgPGJlYW4gaWQ9ImNvbnRleHRzIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLmhhbmRsZXIuQ29udGV4dEhhbmRsZXJDb2xsZWN0aW9uIj4KICAgIDwvYmVhbj4KCiAgPCEtLSAgPGJlYW4gaWQ9ImpldHR5UG9ydCIgY2xhc3M9Im9yZy5hcGFjaGUuYWN0aXZlbXEud2ViLldlYkNvbnNvbGVQb3J0IiBpbml0LW1ldGhvZD0ic3RhcnQiPgoKICAgICAgICA8cHJvcGVydHkgbmFtZT0iaG9zdCIgdmFsdWU9IjAuMC4wLjAiLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icG9ydCIgdmFsdWU9IjgxNjEiLz4KICAgIDwvYmVhbiAtLT4KCiAgICA8YmVhbiBpZD0iU2VydmVyIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLlNlcnZlciIKICAgICAgICBkZXN0cm95LW1ldGhvZD0ic3RvcCI+CgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJoYW5kbGVyIj4KICAgICAgICAgICAgPGJlYW4gaWQ9ImhhbmRsZXJzIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLmhhbmRsZXIuSGFuZGxlckNvbGxlY3Rpb24iPgogICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9ImhhbmRsZXJzIj4KICAgICAgICAgICAgICAgICAgICA8bGlzdD4KICAgICAgICAgICAgICAgICAgICAgICAgPHJlZiBiZWFuPSJjb250ZXh0cyIgLz4KICAgICAgICAgICAgICAgICAgICAgICAgPHJlZiBiZWFuPSJzZWN1cml0eUhhbmRsZXIiIC8+CiAgICAgICAgICAgICAgICAgICAgPC9saXN0PgogICAgICAgICAgICAgICAgPC9wcm9wZXJ0eT4KICAgICAgICAgICAgPC9iZWFuPgogICAgICAgIDwvcHJvcGVydHk+CgogICAgPC9iZWFuPgoKCgogICAgPGJlYW4gaWQ9Imludm9rZUNvbm5lY3RvcnMiIGNsYXNzPSJvcmcuc3ByaW5nZnJhbWV3b3JrLmJlYW5zLmZhY3RvcnkuY29uZmlnLk1ldGhvZEludm9raW5nRmFjdG9yeUJlYW4iPgogICAgCTxwcm9wZXJ0eSBuYW1lPSJ0YXJnZXRPYmplY3QiIHJlZj0iU2VydmVyIiAvPgogICAgCTxwcm9wZXJ0eSBuYW1lPSJ0YXJnZXRNZXRob2QiIHZhbHVlPSJzZXRDb25uZWN0b3JzIiAvPgogICAgCTxwcm9wZXJ0eSBuYW1lPSJhcmd1bWVudHMiPgogICAgCTxsaXN0PgogICAgICAgICAgIAk8YmVhbiBpZD0iQ29ubmVjdG9yIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLlNlcnZlckNvbm5lY3RvciI+CiAgICAgICAgICAgCQk8Y29uc3RydWN0b3ItYXJnIHJlZj0iU2VydmVyIiAvPgogICAgICAgICAgICAgICAgICAgIDwhLS0gc2VlIHRoZSBqZXR0eVBvcnQgYmVhbiAtLT4KICAgICAgICAgICAgICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJob3N0IiB2YWx1ZT0iMTI3LjAuMC4xIiAvPgogICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9InBvcnQiIHZhbHVlPSI4MTYxIiAvPgogICAgICAgICAgICAgICA8L2JlYW4+CiAgICAgICAgICAgICAgICA8IS0tCiAgICAgICAgICAgICAgICAgICAgRW5hYmxlIHRoaXMgY29ubmVjdG9yIGlmIHlvdSB3aXNoIHRvIHVzZSBodHRwcyB3aXRoIHdlYiBjb25zb2xlCiAgICAgICAgICAgICAgICAtLT4KICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgPGJlYW4gaWQ9IlNlY3VyZUNvbm5lY3RvciIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlcnZlci5TZXJ2ZXJDb25uZWN0b3IiPgoJCQkJCTxjb25zdHJ1Y3Rvci1hcmcgcmVmPSJTZXJ2ZXIiIC8+CgkJCQkJPGNvbnN0cnVjdG9yLWFyZz4KCQkJCQkJPGJlYW4gaWQ9ImhhbmRsZXJzIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkudXRpbC5zc2wuU3NsQ29udGV4dEZhY3RvcnkiPgoKCQkJCQkJCTxwcm9wZXJ0eSBuYW1lPSJrZXlTdG9yZVBhdGgiIHZhbHVlPSIvZXRjL2FjdGl2ZW1xL2FtcS5wMTIiIC8+CgkJCQkJCQk8cHJvcGVydHkgbmFtZT0ia2V5U3RvcmVQYXNzd29yZCIgdmFsdWU9IiR7VExTX0tTX1BXRH0iIC8+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0ia2V5U3RvcmVUeXBlIiB2YWx1ZT0icGtjczEyIiAvPgoKICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJ0cnVzdFN0b3JlUGF0aCIgdmFsdWU9Ii9ldGMvYWN0aXZlbXEvYW1xLnAxMiIgLz4KCQkJCQkJCTxwcm9wZXJ0eSBuYW1lPSJ0cnVzdFN0b3JlUGFzc3dvcmQiIHZhbHVlPSIke1RMU19LU19QV0R9IiAvPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9InRydXN0U3RvcmVUeXBlIiB2YWx1ZT0icGtjczEyIiAvPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9Im5lZWRDbGllbnRBdXRoIiB2YWx1ZT0idHJ1ZSIgLz4KICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9ImVuZHBvaW50SWRlbnRpZmljYXRpb25BbGdvcml0aG0iPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxudWxsPjwvbnVsbD4KICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvcHJvcGVydHk+CgkJCQkJCTwvYmVhbj4KCQkJCQk8L2NvbnN0cnVjdG9yLWFyZz4KCQkJCQk8cHJvcGVydHkgbmFtZT0icG9ydCIgdmFsdWU9IjgxNjIiIC8+CgkJCQk8L2JlYW4+CiAgICAgICAgICAgIDwvbGlzdD4KICAgIAk8L3Byb3BlcnR5PgogICAgPC9iZWFuPgoKCTxiZWFuIGlkPSJjb25maWd1cmVKZXR0eSIgY2xhc3M9Im9yZy5zcHJpbmdmcmFtZXdvcmsuYmVhbnMuZmFjdG9yeS5jb25maWcuTWV0aG9kSW52b2tpbmdGYWN0b3J5QmVhbiI+CgkJPHByb3BlcnR5IG5hbWU9InN0YXRpY01ldGhvZCIgdmFsdWU9Im9yZy5hcGFjaGUuYWN0aXZlbXEud2ViLmNvbmZpZy5Kc3BDb25maWd1cmVyLmNvbmZpZ3VyZUpldHR5IiAvPgoJCTxwcm9wZXJ0eSBuYW1lPSJhcmd1bWVudHMiPgoJCQk8bGlzdD4KCQkJCTxyZWYgYmVhbj0iU2VydmVyIiAvPgoJCQkJPHJlZiBiZWFuPSJzZWNIYW5kbGVyQ29sbGVjdGlvbiIgLz4KCQkJPC9saXN0PgoJCTwvcHJvcGVydHk+Cgk8L2JlYW4+CgogICAgPGJlYW4gaWQ9Imludm9rZVN0YXJ0IiBjbGFzcz0ib3JnLnNwcmluZ2ZyYW1ld29yay5iZWFucy5mYWN0b3J5LmNvbmZpZy5NZXRob2RJbnZva2luZ0ZhY3RvcnlCZWFuIgogICAgCWRlcGVuZHMtb249ImNvbmZpZ3VyZUpldHR5LCBpbnZva2VDb25uZWN0b3JzIj4KICAgIAk8cHJvcGVydHkgbmFtZT0idGFyZ2V0T2JqZWN0IiByZWY9IlNlcnZlciIgLz4KICAgIAk8cHJvcGVydHkgbmFtZT0idGFyZ2V0TWV0aG9kIiB2YWx1ZT0ic3RhcnQiIC8+CiAgICA8L2JlYW4+CgogICAgICAgIDwhLS0gc2V0dXAgbXlzcWwgYWNjZXNzIC0tPgogICAgPGJlYW4gaWQ9Im15c3FsLWRzIiBjbGFzcz0ib3JnLmFwYWNoZS5jb21tb25zLmRiY3AuQmFzaWNEYXRhU291cmNlIiBkZXN0cm95LW1ldGhvZD0iY2xvc2UiPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJkcml2ZXJDbGFzc05hbWUiIHZhbHVlPSIje3N5c3RlbUVudmlyb25tZW50WydKREJDX0RSSVZFUiddfSIvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJ1cmwiIHZhbHVlPSIke0pEQkNfVVJMfSIvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJ1c2VybmFtZSIgdmFsdWU9IiN7c3lzdGVtRW52aXJvbm1lbnRbJ0pEQkNfVVNFUiddfSIvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJwYXNzd29yZCIgdmFsdWU9IiN7c3lzdGVtRW52aXJvbm1lbnRbJ0pEQkNfUEFTU1dPUkQnXX0iLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icG9vbFByZXBhcmVkU3RhdGVtZW50cyIgdmFsdWU9InRydWUiLz4KICAgIDwvYmVhbj4KCjwvYmVhbnM+CjwhLS0gRU5EIFNOSVBQRVQ6IGV4YW1wbGUgLS0+",
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

function manageCertMgrJob() {
    //create controller for certs

    if (cfg_obj.key_store.update_controller == null) {
        print("WARNING: Not deploying the cert manager");
        return;
    }

    pathToExtraJS = System.getenv("EXTRA_JS");
    javascript = NetUtil.downloadFile('file://' + pathToExtraJS + '/cert-check.js');

    digest = java.security.MessageDigest.getInstance("SHA-256");
    digest.update(javascript.getBytes("UTF-8"),0,javascript.length);
    digest_bytes = digest.digest();
    digest_base64 = java.util.Base64.getEncoder().encodeToString(digest_bytes);

    is_update_job = false;

    res = k8s.callWS('/api/v1/namespaces/' + k8s_namespace + '/configmaps/cert-controller-js-' + k8s_obj.metadata.name,null,-1);
    if (res.code == 200) {
        currentJs = JSON.parse(res.data);
        currentJsDigest = currentJs.data.digest;

        if (currentJsDigest != digest_base64) {
            patch = {
                "data":{
                    "cert-check.js": javascript,
                    "diget" : digest_base64
                }
            }

            k8s.patchWS('/api/v1/namespaces/' + k8s_namespace + '/configmaps/cert-controller-js-' + k8s_obj.metadata.name,JSON.stringify(patch));
        }
    } else {
        jsCfgMap = {
            "apiVersion":"v1",
            "kind":"ConfigMap",
            "metadata":{
                "labels": {
                    "app": "openunison-" + k8s_obj.metadata.name,
                    "operated-by": "openunison-operator"
                },
                "name": "cert-controller-js-" + k8s_obj.metadata.name,
                "namespace": k8s_namespace
            },
            "data":{
                "cert-check.js": javascript,
                "diget" : digest_base64,
                "input.props":"",
                "deployment.yaml":""
            }
        };

        k8s.postWS('/api/v1/namespaces/' + k8s_namespace + '/configmaps',JSON.stringify(jsCfgMap));
    }

    resp = k8s.callWS('/apis/batch/v1beta1/namespaces/' + k8s_namespace + '/cronjobs/check-certs-' + k8s_obj.metadata.name,null,-1);

    if (resp.code == 200) {
        currentCronJob = JSON.parse(resp.data);
        run_patch = false;
        patch_image = false;
        patch = {};
        if (currentCronJob.spec.jobTemplate.spec.template.spec.containers[0].image != cfg_obj.key_store.update_controller.image) {
            run_patch = true;
            patch_image = true;
            patch = {
                "spec": {
                    "jobTemplate": {
                        "spec":{
                            "template":{
                                "spec": {
        
                                }
                            }
                        }
                    }
                }
            };
            patch.jobTemplate.spec.template.spec["containers"] = currentCronJob.spec.jobTemplate.spec.template.spec.containers;
            patch.jobTemplate.spec.template.spec.containers[0].image = cfg_obj.key_store.update_controller.image;
        }

        if (currentCronJob.spec.schedule != cfg_obj.key_store.update_controller.schedule) {
            run_patch = true;
            if (patch.spec == null) {
                patch["spec"] = {};
            }
            patch.spec["schedule"] = cfg_obj.key_store.update_controller.schedule;
        }

        if (Integer.parseInt(currentCronJob.spec.jobTemplate.spec.template.spec.containers[0].env[0].value) != cfg_obj.key_store.update_controller.days_to_expire) {
            run_patch = true;
            if (! patch_image) {
                patch = {
                    "spec":{
                        "jobTemplate": {
                            "spec":{
                                "template":{
                                    "spec": {
            
                                    }
                                }
                            }
                        }
                    }
                };
                patch.spec.jobTemplate.spec.template.spec["containers"] = currentCronJob.spec.jobTemplate.spec.template.spec.containers;
            }

            patch.spec.jobTemplate.spec.template.spec.containers[0].env[0].value = Integer.toString(cfg_obj.key_store.update_controller.days_to_expire);
        }

        if (run_patch) {
            print("Patching the cert cron job");
            print(JSON.stringify(patch));
            print(k8s.patchWS('/apis/batch/v1beta1/namespaces/' + k8s_namespace + '/cronjobs/check-certs-' + k8s_obj.metadata.name,JSON.stringify(patch))["data"]);
        } else {
            print("Not patching the job");
        }
    } else {



        checkCertsJob = {
            "apiVersion": "batch/v1beta1",
            "kind": "CronJob",
            "metadata": {
                "labels": {
                    "app": "openunison-" + k8s_obj.metadata.name,
                    "operated-by": "openunison-operator"
                },
                "name": "check-certs-" + k8s_obj.metadata.name,
                "namespace": k8s_namespace
            },
            "spec": {
            "schedule": cfg_obj.key_store.update_controller.schedule,
            "jobTemplate": {
                "spec": {
                "template": {
                    "spec": {
                    "containers": [
                        {
                        "name": "check-certs-" + k8s_obj.metadata.name,
                        "image": cfg_obj.key_store.update_controller.image,
                        "env": [
                            {
                                "name":"CERT_DAYS_EXPIRE",
                                "value": Integer.toString(cfg_obj.key_store.update_controller.days_to_expire)
                            }
                        ],
                        "command": ["java", "-jar", "/usr/local/artifactdeploy/artifact-deploy.jar",  "-extraCertsPath","/etc/extracerts","-installScriptURL", "file:///etc/input-maps/cert-check.js","-kubernetesURL","https://kubernetes.default.svc.cluster.local","-rootCaPath","/var/run/secrets/kubernetes.io/serviceaccount/ca.crt","-secretsPath","/etc/input-maps/input.props","-tokenPath","/var/run/secrets/kubernetes.io/serviceaccount/token","-deploymentTemplate","file:///etc/input-maps/deployment.yaml"],
                        "volumeMounts": [
                            {
                                "name":"extra-certs-dir",
                                "mountPath":"/etc/extracerts",
                                "readOnly":true
                            },
                            {
                                "name":"input-maps",
                                "mountPath":"/etc/input-maps",
                                "readOnly":true
                            }
                        ]
                        }
                    ],
                    "restartPolicy": "Never",
                    "serviceAccount": "openunison-operator",
                    "serviceAccountName": "openunison-operator",
                    "volumes": [
                        {
                            "name":"extra-certs-dir",
                            "configMap": {
                                "name": "cert-controller-js-" + k8s_obj.metadata.name
                            }
                        },
                        {
                            "name":"input-maps",
                            "configMap": {
                                "name": "cert-controller-js-" + k8s_obj.metadata.name
                            }
                        }
                    ]
                    }
                },
                "backoffLimit": 1
                }
            }
            }
        };

        print(k8s.postWS('/apis/batch/v1beta1/namespaces/' + k8s_namespace + '/cronjobs',JSON.stringify(checkCertsJob))["data"]);
    }
}