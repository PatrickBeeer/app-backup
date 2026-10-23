import { AppProps } from '../../../types';
import { ReviewTurnoverCoachApp } from '../ReviewTurnoverCoachApp';

export default function App({ platform, costs }: AppProps) {
  return <ReviewTurnoverCoachApp platform={platform} costs={costs} />;
}