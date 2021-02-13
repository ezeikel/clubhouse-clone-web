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
  height: 40%;
  width: 50%;
  border: 1px solid red;
`;

const Video = ({ peer, peerID }) => {
  const ref = useRef();

  useEffect(() => {
    peer.on("stream", (stream) => {
      ref.current.srcObject = stream;
    });
  }, []);

  return (
    <div>
      <h3>{peerID}</h3>
      <StyledVideo playsInline autoPlay ref={ref} />
    </div>
  );
};

const RoomPage = ({ roomId }) => {
  const socket = useSocket();
  const [peers, setPeers] = useState([]);
  const userVideo = useRef();
  const peersRef = useRef([]);

  useEffect(() => {
    if (!socket) return;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        userVideo.current.srcObject = stream;
        socket.emit("join room", roomId);
        socket.on("all users", (users) => {
          debugger;
          const peersAlreadyInRoom = [];
          users.forEach((userID) => {
            const peer = createPeer(userID, socket.id, stream);
            peersRef.current.push({
              peerID: userID,
              peer,
            });
            peersAlreadyInRoom.push({
              peerID: userID,
              peer,
            });
          });

          debugger;
          setPeers(peersAlreadyInRoom);
        });

        socket.on("user joined", (payload) => {
          const item = peersRef.current.find(
            (p) => p.peerID === payload.callerID
          );

          if (!item) {
            const peer = addPeer(payload.signal, payload.callerID, stream);
            peersRef.current.push({
              peerID: payload.callerID,
              peer,
            });

            const peerObj = {
              peer,
              peerID: payload.callerID,
            };

            console.log({ peers, peerObj });

            debugger;
            setPeers((users) => {
              debugger;
              console.log({ users });
              return [...users, peerObj];
            });
          }
        });

        socket.on("receiving returned signal", (payload) => {
          // debugger;
          const item = peersRef.current.find((p) => p.peerID === payload.id);
          console.log({ item });
          if (!item || !item.peer) {
            debugger;
          }
          item.peer.signal(payload.signal);
        });

        socket.on("user left", (id) => {
          // debugger;
          const peerObj = peersRef.current.find((p) => p.peerID === id);
          if (peerObj) {
            peerObj.peer.destroy();
          }

          const remainingPeers = peersRef.current.filter(
            (p) => p.peerID !== id
          );
          peersRef.current = peers;

          debugger;
          setPeers(remainingPeers);
        });

        socket.on("room full", () => {
          console.log("Sorry, that room is full.");
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

    peer.signal(incomingSignal);

    return peer;
  }

  return (
    <Container>
      <h1>Room: {roomId}</h1>
      <div>
        <h1>You:</h1>
        <StyledVideo muted ref={userVideo} autoPlay playsInline />
      </div>
      <div>
        <h1>Others:</h1>
        {peers.map((peer) => {
          console.log(peer.peerID);
          return (
            <Video key={peer.peerID} peer={peer.peer} peerID={peer.peerID} />
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
