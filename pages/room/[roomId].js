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
`;

const StyledVideo = styled.video`
  height: 64px;
  width: 64px;
  border-radius: 50%;
  border: 3px solid ${({ volume }) => (volume > 0 ? "#000" : "transparent")};
`;

const Video = ({ peer, peerID, muted }) => {
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
    <div>
      <h3>{peerID}</h3>
      <StyledVideo playsInline autoPlay ref={ref} volume={volume} />
      {muted && <span>Muted</span>}
    </div>
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

  const userVideo = useRef();
  const buttonEl = useRef();

  const [audioTrackEnabled, setAudioTrackEnabled] = useState(true);
  const [userVolume, setUserVolume] = useState(0);

  let audioCtx, gainNode, analyser;

  if (typeof window !== "undefined") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    let audioVolume = 0;
    let oldAudioVolume = 0;

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
        setUserVolume(audioVolume);
        oldAudioVolume = audioVolume;
      }
    }

    calcVolume();
  }

  useEffect(() => {
    if (window.localStream) {
      window.localStream.getAudioTracks()[0].enabled = audioTrackEnabled;

      socket.emit("sending mutechange", {
        peerID: socket.id,
        muted: !audioTrackEnabled,
      });
    }
  }, [audioTrackEnabled]);

  useEffect(() => {
    if (!socket) return;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        userVideo.current.srcObject = stream;

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
  }, [socket]);

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

  return (
    <Container>
      <h1>Room: {roomId}</h1>
      <div>
        <h1>You: ({socket && socket.id})</h1>
        <StyledVideo
          muted
          ref={userVideo}
          autoPlay
          playsInline
          volume={userVolume}
        />
        <button
          ref={buttonEl}
          onClick={() => {
            setAudioTrackEnabled(!audioTrackEnabled);
          }}
        >
          {audioTrackEnabled ? "mute" : "unmute"}
        </button>
      </div>
      <div>
        <h1>Others:</h1>
        {peers.map((peer) => {
          return (
            <Video
              key={peer.peerID}
              peer={peer.peer}
              peerID={peer.peerID}
              muted={peer.muted}
            />
          );
        })}
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
