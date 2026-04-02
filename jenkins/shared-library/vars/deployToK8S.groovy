def call(Map config = [:]) {
    validateConfig(config)

    String action = config.action
    String appName = config.appName
    String namespace = config.namespace
    String imageTag = config.imageTag
    String imageUri = config.imageUri ?: "${appName}:${imageTag}"
    String replicas = config.replicas ?: '2'
    String kubectlBin = config.kubectlBin ?: 'kubectl'

    switch (action) {
        case 'deploy':
            renderAndApply(appName, namespace, imageTag, imageUri, replicas, kubectlBin)
            checkRollout(appName, namespace, kubectlBin)
            break
        case 'update':
            runKubectl(kubectlBin, "set image deployment/${appName} ${appName}=${imageUri} -n ${namespace}")
            checkRollout(appName, namespace, kubectlBin)
            break
        case 'delete':
            runKubectl(kubectlBin, "delete deployment ${appName} -n ${namespace} --ignore-not-found=true")
            runKubectl(kubectlBin, "delete service ${appName} -n ${namespace} --ignore-not-found=true")
            runKubectl(kubectlBin, "delete ingress ${appName} -n ${namespace} --ignore-not-found=true")
            break
        default:
            error("Unsupported ACTION: ${action}")
    }
}

def validateConfig(Map config) {
    ['action', 'appName', 'namespace', 'imageTag'].each { key ->
        if (!config[key]) {
            error("Missing required config field: ${key}")
        }
    }

    if (!['deploy', 'update', 'delete'].contains(config.action)) {
        error("ACTION must be one of deploy|update|delete, got ${config.action}")
    }
}

def renderAndApply(String appName, String namespace, String imageTag, String imageUri, String replicas, String kubectlBin) {
    String generatedDir = '.generated-k8s'
    sh "mkdir -p ${generatedDir}"

    renderTemplate('k8s/deployments/app-deployment.yml.j2', "${generatedDir}/app-deployment.yml", appName, namespace, imageTag, imageUri, replicas)
    renderTemplate('k8s/deployments/app-service.yml.j2', "${generatedDir}/app-service.yml", appName, namespace, imageTag, imageUri, replicas)
    renderTemplate('k8s/deployments/app-ingress.yml.j2', "${generatedDir}/app-ingress.yml", appName, namespace, imageTag, imageUri, replicas)

    runKubectl(kubectlBin, "apply -f ${generatedDir}/app-deployment.yml")
    runKubectl(kubectlBin, "apply -f ${generatedDir}/app-service.yml")
    runKubectl(kubectlBin, "apply -f ${generatedDir}/app-ingress.yml")
}


def renderTemplate(String source, String target, String appName, String namespace, String imageTag, String imageUri, String replicas) {
    String strategyBlock = buildStrategyBlock(namespace)
    String content = readFile(file: source)
    content = content
        .replace('{{ APP_NAME }}', appName)
        .replace('{{ NAMESPACE }}', namespace)
        .replace('{{ IMAGE_TAG }}', imageTag)
        .replace('{{ IMAGE_URI }}', imageUri)
        .replace('{{ REPLICAS }}', replicas)
        .replace('{{ STRATEGY_BLOCK }}', strategyBlock)
    writeFile(file: target, text: content)
}

def buildStrategyBlock(String namespace) {
    if (namespace == 'production') {
        return '''  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
    type: RollingUpdate
'''
    }
    return ''
}

def checkRollout(String appName, String namespace, String kubectlBin) {
    try {
        runKubectl(kubectlBin, "rollout status deployment/${appName} -n ${namespace} --timeout=180s")
    } catch (Exception ex) {
        echo "Rollout check failed for deployment/${appName} in ${namespace}."
        throw ex
    }
}

def runKubectl(String kubectlBin, String args) {
    withEnv(["KUBE_BIN=${kubectlBin}"]) {
        sh(script: '''
            "$KUBE_BIN" ''' + args)
    }
}