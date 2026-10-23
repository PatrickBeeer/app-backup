import { AppProps } from '../../../types';
import { VirtualTryOnApp } from '../VirtualTryOnApp';

export default function App({ platform, costs }: AppProps) {
  return <VirtualTryOnApp platform={platform} costs={costs} />;
}
