import { AppProps } from '../../../types';
import { AiExhibitionDesignApp } from '../App';

export default function App({ platform, costs }: AppProps) {
  return <AiExhibitionDesignApp platform={platform} costs={costs} />;
}
