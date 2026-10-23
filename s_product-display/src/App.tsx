import { AppProps } from '../../../types';
import AIProductDisplayApp from '../AIProductDisplayApp';

export default function App({ platform, costs }: AppProps) {
  return <AIProductDisplayApp platform={platform} costs={costs} />;
}
