import { AppProps } from '../../../types';
import { AiCameraSchedulerApp } from '../AiCameraSchedulerApp';

export default function App({ platform }: AppProps) {
  return <AiCameraSchedulerApp platform={platform} />;
}
