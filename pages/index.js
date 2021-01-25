import { useEffect } from "react";
import { useRouter } from "next/router";
import { v4 as uuidv4 } from "uuid";

const Index = () => {
  const router = useRouter();

  useEffect(() => {
    const roomId = uuidv4();
    router.push(`/room/${roomId}`);
  }, []);

  return null;
};

export default Index;
