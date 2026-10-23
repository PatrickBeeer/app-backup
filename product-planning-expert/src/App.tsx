import { AppProps } from '../../../types';
import { ProductPlanningExpertApp } from '../ProductPlanningExpertApp';

export default function App({ platform, costs }: AppProps) {
  return <ProductPlanningExpertApp platform={platform} costs={costs} />;
}
