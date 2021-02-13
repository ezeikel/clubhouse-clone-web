import styled from "styled-components";
import { SocketContextProvider } from "../contexts/socket";

const Wrapper = styled.div`
  display: flex;
`;

const Page = ({ children }) => {
  return (
    <>
      <SocketContextProvider>
        <Wrapper>{children}</Wrapper>
      </SocketContextProvider>
    </>
  );
};

export default Page;
