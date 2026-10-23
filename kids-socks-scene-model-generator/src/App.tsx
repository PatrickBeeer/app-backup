import { AppProps } from '../../../types';
import { KidsSocksSceneModelGeneratorApp } from '../KidsSocksSceneModelGeneratorApp';

export default function App({ platform, costs }: AppProps) {
  return <KidsSocksSceneModelGeneratorApp platform={platform} costs={costs} />;
}
