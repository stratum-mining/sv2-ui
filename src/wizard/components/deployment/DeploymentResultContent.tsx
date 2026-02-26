// Main deployment result content component - routes to specific deployment components

import { PoolConnectionDockerDeployment } from './PoolConnectionDockerDeployment';
import { PoolConnectionBinariesDeployment } from './PoolConnectionBinariesDeployment';

export const DeploymentResultContent = ({
  type,
  method,
  data
}: {
  type: 'pool-connection',
  method: 'docker' | 'binaries',
  data?: any
}) => {
  if (type === 'pool-connection' && method === 'docker') {
    return <PoolConnectionDockerDeployment data={data} />;
  }

  // Pool Connection Binaries
  return <PoolConnectionBinariesDeployment data={data} />;
};
