import { AppProps } from '../../../types';
import { XiaohongshuCoverBreakdownApp } from '../XiaohongshuCoverBreakdownApp';

export default function App({ platform, costs }: AppProps) {
  return <XiaohongshuCoverBreakdownApp platform={platform} costs={costs} />;
}
