import { AppProps } from '../../../types';
import { AiModelBackgroundSwapApp } from '../AiModelBackgroundSwapApp';

export default function App({ platform, costs }: AppProps) {
  return <AiModelBackgroundSwapApp platform={platform} costs={costs} />;
}