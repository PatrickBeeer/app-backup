import { AppProps } from '../../../types';
import { SkincareMainImageApp } from '../SkincareMainImageApp';

export default function App({ platform, costs }: AppProps) {
  return <SkincareMainImageApp platform={platform} costs={costs} />;
}