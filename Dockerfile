FROM fedora:31

RUN HOME=/root && \
    INSTALL_PKGS=" \
        bash-completion \
        findutils \
        gcc \
        gcc-c++ \
        git \
        glibc-langpack-en \
        make \
        nodejs \
        procps \
        redhat-rpm-config \
        sudo \
        which \
        yarn \
    " && \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 && \
    curl -sL https://rpm.nodesource.com/setup_10.x | bash - && \
    curl -sL https://dl.yarnpkg.com/rpm/yarn.repo | tee /etc/yum.repos.d/yarn.repo && \
    dnf install -y --setopt=tsflags=nodocs $INSTALL_PKGS && \
    dnf clean -y --enablerepo='*' all && \
    sed -i.bak -e '1i auth requisite pam_deny.so' /etc/pam.d/su && \
    sed -i.bak -e 's/^%wheel/# %wheel/' /etc/sudoers && \
    useradd -u 1001 -g 0 -M -d /home/eduk8s eduk8s && \
    mkdir -p /home/eduk8s && \
    chown -R 1001:0 /home/eduk8s && \
    chmod -R g=u /home/eduk8s && \
    chmod g+w /etc/passwd && \
    chown 1001:0 /opt

COPY --chown=1001:0 . /home/eduk8s/

USER 1001

WORKDIR /home/eduk8s

RUN npm install && \
    npm run compile

EXPOSE 8080

CMD [ "npm", "start" ]
