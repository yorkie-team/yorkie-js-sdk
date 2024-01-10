import { PresenceTree } from '../components/Tree';
import { JSONDetail } from '../components/Detail';
import { useSeletedPresence } from '../contexts/SeletedPresence';
import { usePresences } from '../contexts/YorkieSource';
import { CloseIcon } from '../icons';

export function Presence() {
  const presences = usePresences();
  const [selectedPresence, setSelectedPresence] = useSeletedPresence();

  return (
    <div className="yorkie-presence content-wrap">
      <div className="title">Presence</div>
      <div className="content">
        <PresenceTree presences={presences} />
        {selectedPresence && (
          <div className="selected-content">
            <div className="selected-title">
              {selectedPresence.key}
              <button
                className="selected-close-btn"
                onClick={() => {
                  setSelectedPresence(null);
                }}
              >
                <CloseIcon />
              </button>
            </div>
            <JSONDetail
              json={JSON.stringify(selectedPresence.value, null, 2)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
