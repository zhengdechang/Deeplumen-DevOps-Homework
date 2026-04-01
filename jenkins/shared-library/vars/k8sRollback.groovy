def call(Map config) {
    String appName = config.appName
    String kubeconfigPath = config.kubeconfigPath
    String kubeContext = config.kubeContext
    String namespace = config.namespace

    if (!appName || !kubeconfigPath || !kubeContext || !namespace) {
        error('k8sRollback requires appName, kubeconfigPath, kubeContext, and namespace.')
    }

    sh """
        # Roll back both deployments after a failed full-stack update.
        kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" rollout undo deployment/'${appName}-frontend' -n '${namespace}' || true
        kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" rollout undo deployment/'${appName}-backend' -n '${namespace}' || true
    """
}