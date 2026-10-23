import { AppProps } from '../../../types';
import { KidsClothingModelApp } from '../KidsClothingModelApp';

export default function App({ platform, costs }: AppProps) {
  return <KidsClothingModelApp platform={platform} costs={costs} />;
}
