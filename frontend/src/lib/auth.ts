import Cookies from "js-cookie";

export const setAuthToken = (token: string) => {
  Cookies.set("token", token, { expires: 7, secure: true, sameSite: "strict" });
};

export const removeAuthToken = () => {
  Cookies.remove("token");
};

export const getAuthToken = () => {
  return Cookies.get("token");
};

export const isAuthenticated = () => {
  return !!getAuthToken();
};
