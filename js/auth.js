function getToken(){
    return localStorage.getItem("access_token");
}

function getEmail(){
    return localStorage.getItem("user_email");
}

//로그인 이후 사용자 인증 시 사용
function authFetch(url, options={}){
    const access_token = getToken();
    const headers = options.headers || {};

    if(access_token){
        headers['Authorization'] = `Bearer ${access_token}`;
    }

    return fetch(url, {
        ...options,
        headers
    });
}

function isLoggedIn() {
    return !!getToken();
}