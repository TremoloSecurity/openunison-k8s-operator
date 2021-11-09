//Global Vars
var inProp = {};
var CertUtils = Java.type("com.tremolosecurity.kubernetes.artifacts.util.CertUtils");
var NetUtil = Java.type("com.tremolosecurity.kubernetes.artifacts.util.NetUtil");
var cfg_obj = {};
var k8s_obj = {};
var ouKS;
var ksPassword;
var secret_data_changed = true;
var amq_secrets_changed = true;
var amq_env_secrets_changed = true;
var System = Java.type("java.lang.System");
var Integer = Java.type("java.lang.Integer");
var Class = Java.type("java.lang.Class");
var DriverManager = Java.type("java.sql.DriverManager");