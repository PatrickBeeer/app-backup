import { AppProps } from '../../../types';
import { AiHomeRenovationApp } from '../App';

export default function App({ platform, costs }: AppProps) {
  return <AiHomeRenovationApp platform={platform} costs={costs} />;
}
