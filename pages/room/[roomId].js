// https://www.youtube.com/watch?v=DvlyzDZDEq4&ab_channel=WebDevSimplified

import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
// import dynamic from "next/dynamic";
import styled from "styled-components";
import io from "socket.io-client";

// const Peer = dynamic(() => import("peerjs"), {
//   ssr: false,
// });

const Wrapper = styled.div`
  display: flex;
`;

const RoomPage = ({ roomId }) => {
  const containerEl = useRef(null);

  useEffect(() => {
    startStream();
  }, []);

  const startStream = async () => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL);

    const myPeer = new Peer(undefined, {
      host: process.env.NEXT_PUBLIC_API_HOST,
      port: process.env.NEXT_PUBLIC_API_PORT,
      path: "/peerjs",
      secure: process.env.NODE_ENV === "production",
    });

    myPeer.on("open", (id) => {
      console.log({
        roomId,
        id,
      });
      socket.emit("join-room", roomId, id);
    });

    const myVideo = document.createElement("video");
    myVideo.muted = true;

    const peers = {};

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    addVideoStream(myVideo, stream);

    myPeer.on("call", (call) => {
      call.answer(stream);

      const video = document.createElement("video");
      call.on("stream", (userVideoStream) => {
        addVideoStream(video, userVideoStream);
      });
    });

    socket.on("user-connected", (userId) => {
      console.log("User connected " + userId);
      connectToNewUser(userId, stream);
    });

    socket.on("user-disconnected", (userId) => {
      if (peers[userId]) peers[userId].close();
    });

    const connectToNewUser = (userId, stream) => {
      const call = myPeer.call(userId, stream);
      const video = document.createElement("video");
      call.on("stream", (userVideoStream) => {
        addVideoStream(video, userVideoStream);
      });
      call.on("close", () => {
        video.remove();
      });

      peers[userId] = call;
    };
  };

  const addVideoStream = (video, stream) => {
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", () => {
      video.play();
    });

    containerEl.current.append(video);
  };

  return (
    <Wrapper>
      <h1>Room {roomId}</h1>
      <div ref={containerEl} />
    </Wrapper>
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
