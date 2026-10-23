import { AppProps } from '../../../types';
import { AIScriptToStoryboardMasterApp } from '../AIScriptToStoryboardMasterApp';

export default function App({ platform, costs }: AppProps) {
  return <AIScriptToStoryboardMasterApp platform={platform} costs={costs} />;
}
