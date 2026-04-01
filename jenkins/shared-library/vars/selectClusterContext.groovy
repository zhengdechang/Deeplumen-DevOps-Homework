def call(Map config) {
    String clusterName = config.clusterName
    String registryFile = config.registryFile ?: 'clusters/managed-clusters.yml'
    String namespaceOverride = config.namespaceOverride ?: ''

    if (!clusterName) {
        error('selectClusterContext requires clusterName.')
    }

    def registry = readYaml(file: registryFile)
    def cluster = registry.managed_clusters.find { it.name == clusterName }

    if (!cluster) {
        error("Cluster '${clusterName}' was not found in ${registryFile}.")
    }

    return [
        name: cluster.name,
        provider: cluster.provider,
        region: cluster.region,
        environment: cluster.environment,
        kubeContext: cluster.kube_context,
        releaseNamespace: namespaceOverride?.trim() ? namespaceOverride.trim() : cluster.release_namespace,
        ingressDomainSuffix: cluster.ingress_domain_suffix
    ]
}