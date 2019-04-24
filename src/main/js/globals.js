//Global Vars
var inProp = {};
var CertUtils = Java.type("com.tremolosecurity.kubernetes.artifacts.util.CertUtils");
var cfg_obj = {};
var k8s_obj = {};
var ouKS;
var ksPassword;
var secret_data_changed = true;
var amq_secrets_changed = true;
var amq_env_secrets_changed = true;