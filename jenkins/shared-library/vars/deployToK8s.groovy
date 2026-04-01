def call(Map config) {
    String action = config.action
    String appName = config.appName
    String kubeconfigPath = config.kubeconfigPath
    String kubeContext = config.kubeContext
    String namespace = config.namespace
    String clusterName = config.clusterName ?: 'unknown-cluster'
    String deployEnv = config.deployEnv ?: 'unknown-environment'
    String appVersion = config.appVersion ?: 'latest'
    String frontendImage = config.frontendImage
    String backendImage = config.backendImage
    String frontendReplicas = config.frontendReplicas ?: '2'
    String backendReplicas = config.backendReplicas ?: '2'
    String frontendPort = config.frontendPort ?: '8080'
    String backendPort = config.backendPort ?: '8080'
    String frontendServicePort = config.frontendServicePort ?: '80'
    String backendServicePort = config.backendServicePort ?: '80'
    String ingressHost = config.ingressHost
    String registrySecretName = config.registrySecretName ?: 'regcred'

    if (!action || !appName || !kubeconfigPath || !kubeContext || !namespace) {
        error('deployToK8s requires action, appName, kubeconfigPath, kubeContext, and namespace.')
    }

    if (action == 'deploy') {
        sh """
            export APP_NAME='${appName}'
            export TARGET_NAMESPACE='${namespace}'
            export CLUSTER_NAME='${clusterName}'
            export DEPLOY_ENV='${deployEnv}'
            export APP_VERSION='${appVersion}'
            export FRONTEND_IMAGE='${frontendImage}'
            export BACKEND_IMAGE='${backendImage}'
            export FRONTEND_REPLICAS='${frontendReplicas}'
            export BACKEND_REPLICAS='${backendReplicas}'
            export FRONTEND_PORT='${frontendPort}'
            export BACKEND_PORT='${backendPort}'
            export FRONTEND_SERVICE_PORT='${frontendServicePort}'
            export BACKEND_SERVICE_PORT='${backendServicePort}'
            export INGRESS_HOST='${ingressHost}'
            export REGISTRY_SECRET_NAME='${registrySecretName}'

            envsubst < k8s/deployments/frontend-deployment.yml.j2 | kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" apply -f -
            envsubst < k8s/deployments/backend-deployment.yml.j2 | kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" apply -f -
            envsubst < k8s/deployments/frontend-service.yml.j2 | kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" apply -f -
            envsubst < k8s/deployments/backend-service.yml.j2 | kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" apply -f -
            envsubst < k8s/deployments/stack-ingress.yml.j2 | kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" apply -f -
        """
        return
    }

    if (action == 'update') {
        sh """
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" set image deployment/'${appName}-frontend' frontend='${frontendImage}' -n '${namespace}'
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" set image deployment/'${appName}-backend' backend='${backendImage}' -n '${namespace}'
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" scale deployment/'${appName}-frontend' --replicas='${frontendReplicas}' -n '${namespace}'
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" scale deployment/'${appName}-backend' --replicas='${backendReplicas}' -n '${namespace}'
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" rollout restart deployment/'${appName}-frontend' -n '${namespace}'
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" rollout restart deployment/'${appName}-backend' -n '${namespace}'
        """
        return
    }

    if (action == 'delete') {
        sh """
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" delete ingress '${appName}' -n '${namespace}' --ignore-not-found
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" delete service '${appName}-frontend' -n '${namespace}' --ignore-not-found
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" delete service '${appName}-backend' -n '${namespace}' --ignore-not-found
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" delete deployment '${appName}-frontend' -n '${namespace}' --ignore-not-found
            kubectl --kubeconfig "${kubeconfigPath}" --context "${kubeContext}" delete deployment '${appName}-backend' -n '${namespace}' --ignore-not-found
        """
        return
    }

    error("Unknown action '${action}'")
}