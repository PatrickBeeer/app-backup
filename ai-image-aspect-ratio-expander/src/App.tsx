import { AppProps } from '../../../types';
import { AiImageAspectRatioExpanderApp } from '../AiImageAspectRatioExpanderApp';

export default function App({ platform, costs }: AppProps) {
  return <AiImageAspectRatioExpanderApp platform={platform} costs={costs} />;
}
