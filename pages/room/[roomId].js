// https://github.com/coding-with-chaim/group-video-final/blob/d7f34070c9e060a3dd64214338df0255a44daf27/client/src/routes/Room.js#L20

import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import Peer from "simple-peer";
import { useSocket } from "../../contexts/socket";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px;
  display: flex;
  height: 100vh;
  width: 90%;
  margin: auto;
  box-sizing: border-box;
`;

const Avatar = styled.div`
  background-color: tomato;
  height: 64px;
  width: 64px;
  border-radius: 50%;
  border: 3px solid ${({ volume }) => (volume > 0 ? "#000" : "transparent")};
`;

const User = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;

  > button,
  > div:nth-of-type(2) {
    margin-top: 16px;
  }
`;

const UserList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  grid-gap: 32px;
`;

const OtherUser = ({ peer, peerID, muted }) => {
  const ref = useRef();
  const [volume, setVolume] = useState(0);

  let audioCtx, gainNode, analyser;
  let audioVolume = 0;
  let oldAudioVolume = 0;

  useEffect(() => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    function calcVolume() {
      requestAnimationFrame(calcVolume);

      analyser.getByteTimeDomainData(dataArray);
      let mean = 0;
      for (let i = 0; i < dataArray.length; i++) {
        mean += Math.abs(dataArray[i] - 127);
      }
      mean /= dataArray.length;
      mean = Math.round(mean);
      if (mean < 2) {
        audioVolume = 0;
      } else if (mean < 5) {
        audioVolume = 1;
      } else {
        audioVolume = 2;
      }

      if (audioVolume !== oldAudioVolume) {
        // let ui respond to volume change
        setVolume(audioVolume);
        oldAudioVolume = audioVolume;
      }
    }

    calcVolume();

    peer.on("stream", (stream) => {
      ref.current.srcObject = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    });
  }, []);

  return (
    <User>
      <Avatar volume={volume} data-socket-id={peerID}>
        <audio autoPlay ref={ref} />
      </Avatar>
      <div>{peerID.slice(peerID.length - 4)}</div>
      {muted && <div>Muted</div>}
    </User>
  );
};

const RoomPage = ({ roomId }) => {
  const socket = useSocket();

  const [peers, _setPeers] = useState([]);
  const peersRef = useRef(peers); // https://stackoverflow.com/questions/55265255/react-usestate-hook-event-handler-using-initial-state
  const setPeers = (data) => {
    peersRef.current = data;
    _setPeers(data);
  };

  const userAudio = useRef();
  const buttonEl = useRef();

  const [audioTrackEnabled, setAudioTrackEnabled] = useState(true);
  const [audioVolume, setAudioVolume] = useState(0);
  const [oldAudioVolume, setOldAudioVolume] = useState(0);
  const [userSpeaking, setUserSpeaking] = useState(false); // TODO: eventually pass this to avatar
  const [userInteracted, setUserInteracted] = useState(false);
  const [audioCtx, setAudioCtx] = useState(null);

  let gainNode, analyser;

  useEffect(() => {
    if (!audioCtx) return;

    const resumeContext = async () => {
      await audioCtx.resume();
    };

    if (userInteracted && audioCtx.state !== "running") {
      resumeContext();
    } else if (!userInteracted && audioCtx.state === "running") {
      setUserInteracted(true);
    }
  }, [userInteracted, audioCtx]);

  useEffect(() => {
    setAudioCtx(new (window.AudioContext || window.webkitAudioContext)());
  }, []);

  useEffect(() => {
    if (audioVolume !== oldAudioVolume) {
      setUserSpeaking(audioVolume > 0);
      setOldAudioVolume(audioVolume);
    }
  }, [audioVolume]);

  useEffect(() => {
    if (!audioCtx) return;

    gainNode = audioCtx.createGain();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    console.log({ initalContextState: audioCtx.state });

    audioCtx.onstatechange = function () {
      console.log({ stateChanged: audioCtx.state });
    };

    function calcVolume() {
      // console.log("calcVolume()"); // TODO: this is firing even when on mute
      requestAnimationFrame(calcVolume);

      analyser.getByteTimeDomainData(dataArray);
      let mean = 0;
      for (let i = 0; i < dataArray.length; i++) {
        mean += Math.abs(dataArray[i] - 127);
      }
      mean /= dataArray.length;
      mean = Math.round(mean);
      if (mean < 2) {
        setAudioVolume(0);
      } else if (mean < 5) {
        setAudioVolume(1);
      } else {
        setAudioVolume(2);
      }
    }

    calcVolume();
  }, [audioCtx]);

  useEffect(() => {
    if (!socket) return;

    if (window.localStream) {
      window.localStream.getAudioTracks()[0].enabled = audioTrackEnabled;

      socket.emit("sending mutechange", {
        peerID: socket.id,
        muted: !audioTrackEnabled,
      });
    }
  }, [socket, audioTrackEnabled]);

  useEffect(() => {
    if (!socket || !audioCtx) return;

    navigator.mediaDevices
      .getUserMedia({ video: false, audio: true })
      .then((stream) => {
        userAudio.current.srcObject = stream;

        window.localStream = stream;

        setAudioTrackEnabled(stream.getAudioTracks()[0].enabled);

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        socket.emit("join room", {
          roomId,
          muted: !stream.getAudioTracks()[0].enabled,
        });

        socket.on("all users", (users) => {
          const peersAlreadyInRoom = [];

          users.forEach(({ socketId, muted }) => {
            if (socketId !== socket.id) {
              const peer = createPeer(socketId, socket.id, stream);

              peersAlreadyInRoom.push({
                peerID: socketId,
                peer,
                muted,
              });
            }
          });

          setPeers(peersAlreadyInRoom);
        });

        socket.on("user joined", (payload) => {
          const item = peersRef.current.find(
            (p) => p.peerID === payload.callerID
          );

          if (!item) {
            const peer = addPeer(payload.signal, payload.callerID, stream);

            const peerObj = {
              peer,
              peerID: payload.callerID,
              muted: false,
            };

            setPeers([...peersRef.current, peerObj]);
          }
        });

        socket.on("receiving returned signal", (payload) => {
          const item = peersRef.current.find((p) => p.peerID === payload.id);
          item.peer.signal(payload.signal);
        });

        socket.on("user left", (id) => {
          const peerObj = peersRef.current.find((p) => p.peerID === id);
          if (peerObj) {
            peerObj.peer.destroy();
          }

          const remainingPeers = peersRef.current.filter(
            (p) => p.peerID !== id
          );

          setPeers(remainingPeers);
        });

        socket.on("room full", () => {
          alert("Sorry, that room is full.");
        });

        socket.on("returning mutechange", (payload) => {
          const peerObj = peersRef.current.find(
            (p) => p.peerID === payload.peerID
          );

          const remainingPeers = peersRef.current.filter(
            (p) => p.peerID !== payload.peerID
          );

          setPeers([
            ...remainingPeers,
            {
              ...peerObj,
              muted: payload.muted,
            },
          ]);
        });
      });
  }, [socket, audioCtx]);

  function createPeer(userToSignal, callerID, stream) {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("sending signal", {
        userToSignal,
        callerID,
        signal,
      });
    });

    peer.on("close", () => {});

    peer.on("error", (err) => console.error(err));

    return peer;
  }

  function addPeer(incomingSignal, callerID, stream) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("returning signal", { signal, callerID });
    });

    peer.on("close", () => {});

    peer.on("error", (err) => console.error(err));

    peer.signal(incomingSignal);

    return peer;
  }

  if (!socket) return null;

  return (
    <Container>
      <div>
        <h1>Room: {roomId}</h1>
        {!userInteracted && (
          <button
            onClick={() => {
              console.log({ clickEvent: audioCtx.state });
              setUserInteracted(true);
            }}
          >
            Get started
          </button>
        )}
      </div>
      <div>
        <UserList>
          <User>
            <Avatar volume={audioVolume} data-socket-id={socket.id}>
              <audio muted autoPlay ref={userAudio} />
            </Avatar>
            <div>{socket.id && socket.id.slice(socket.id.length - 4)}</div>
            <button
              ref={buttonEl}
              onClick={() => {
                setAudioTrackEnabled(!audioTrackEnabled);
              }}
            >
              {audioTrackEnabled ? "mute" : "unmute"}
            </button>
          </User>
        </UserList>
      </div>
      <div>
        <h3>Others in the room</h3>
        <UserList>
          {peers.map((peer) => {
            return (
              <OtherUser
                key={peer.peerID}
                peer={peer.peer}
                peerID={peer.peerID}
                muted={peer.muted}
              />
            );
          })}
        </UserList>
      </div>
    </Container>
  );
};

// This gets called on every request
export async function getServerSideProps(context) {
  const { roomId } = context.query;

  return {
    props: {
      roomId,
    },
  };
}

export default RoomPage;
