import { AppProps } from '../../../types';
import { AiCarpetDesignApp } from '../App';

export default function App({ platform, costs }: AppProps) {
  return <AiCarpetDesignApp platform={platform} costs={costs} />;
}
