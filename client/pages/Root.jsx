import App from '@/components/App';
import { isStandbySoakPath } from '@/features/realtime/lib/standby-soak';
import StandbySoakPage from '@/pages/StandbySoakPage';

const Root = ({ pathname = '/' }) => {
  if (isStandbySoakPath(pathname)) {
    return <StandbySoakPage />;
  }

  return <App />;
};

export default Root;
