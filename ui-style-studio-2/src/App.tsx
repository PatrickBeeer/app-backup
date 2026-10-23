import { AppProps } from '../../../types';
import { UiStyleStudio2App } from '../App';

export default function App({ platform, costs }: AppProps) {
  return <UiStyleStudio2App platform={platform} costs={costs} />;
}
