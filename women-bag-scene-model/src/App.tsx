import { AppProps } from '../../../types';
import { WomenBagSceneModelApp } from '../WomenBagSceneModelApp';

export default function App({ platform, costs }: AppProps) {
  return <WomenBagSceneModelApp platform={platform} costs={costs} />;
}
