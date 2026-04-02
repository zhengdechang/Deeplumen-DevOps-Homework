def call(Map config = [:]) {
    String appName = config.appName
    String namespace = config.namespace
    String kubectlBin = config.kubectlBin ?: 'kubectl'

    if (!appName || !namespace) {
        error('k8sRollback requires appName and namespace')
    }

    withEnv(["KUBE_BIN=${kubectlBin}"]) {
        sh(script: '''
            "$KUBE_BIN" rollout undo deployment/''' + appName + ' -n ' + namespace)
    }

    echo "Rollback executed for deployment/${appName} in namespace ${namespace}."
}
