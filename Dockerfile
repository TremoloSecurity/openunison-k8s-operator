FROM ubuntu:20.04

MAINTAINER Tremolo Security, Inc. - Docker <docker@tremolosecurity.com>

ENV JDK_VERSION=1.8.0 \
    OPENUNISON_OPERATOR_VERSION=1.3.0 

LABEL io.k8s.description="OpenUnison operator" \
      io.k8s.display-name="OpenUnison Operator" 

RUN apt-get update;apt-get -y install openjdk-8-jdk-headless curl apt-transport-https gnupg && \
    curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - && \
    echo "deb http://apt.kubernetes.io/ kubernetes-xenial main" > /etc/apt/sources.list.d/kubernetes.list && \
    apt-get update; apt-get install -y kubectl ; apt-get -y upgrade;apt-get clean;rm -rf /var/lib/apt/lists/*; \
    groupadd -r openunison -g 433 && \
    mkdir /usr/local/openunison && \
    useradd -u 431 -r -g openunison -d /usr/local/openunison -s /sbin/nologin -c "OpenUnison Operator image user" openunison && \
    curl https://nexus.tremolo.io/repository/betas/com/tremolosecurity/kubernetes/javascript-operator/$OPENUNISON_OPERATOR_VERSION/javascript-operator-$OPENUNISON_OPERATOR_VERSION.jar -o /usr/local/openunison/javascript-operator.jar

ADD src/main/js /usr/local/openunison/js
ADD src/main/js-external /usr/local/openunison/js-external

RUN chown -R openunison:openunison /usr/local/openunison 


USER 431

CMD ["/usr/bin/java", "-jar", "/usr/local/openunison/javascript-operator.jar"]

