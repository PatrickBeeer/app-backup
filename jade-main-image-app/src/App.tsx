import { AppProps } from '../../../types';
import { JadeMainImageApp } from '../App';

export default function App({ platform, costs }: AppProps) {
  return <JadeMainImageApp platform={platform} costs={costs} />;
}
