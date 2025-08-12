import { API_BASE } from './auth.js';

const fileInput = document.getElementById("user_image");
const previewImage = document.getElementById("profile-image-preview");

previewImage.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        previewImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
    }
});


document.getElementById('signup-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    //회원가입 버튼 눌렀을 때
    //필드가 다 채워졌는지 2차 확인
    console.log("버튼 클릭");
    const username = document.getElementById('user_name').value; 
    const email = document.getElementById('user_email').value;
    const password = document.getElementById('user_password').value;
    const file = document.getElementById('user_image').files[0];

    if(!username || !email || password.length < 6){
        e.preventDefault();
        alert("모든 필드를 바르게 입력해주세요.");
        return;
    }

    const formData = new FormData();
    formData.append("user_name", username);
    formData.append("user_email", email);
    formData.append("user_password", password);
    if (file) {
        formData.append("user_image", file);
    }

    //백엔드 연동하기 (토큰 필요 없음)
    try {
        const response = await fetch(`${API_BASE}/nova/auth/signup`, {
        method: 'POST',
        body: formData
        });

        const result = await response.json();
        if (response.ok) {
            // 회원가입 성공 시에만 이동
            console.log("회원가입 성공");
            window.location.href = '/html/login.html';
        } else {
            console.warn("회원가입 실패 응답:", result); 
            alert(result.detail || "회원가입 실패");
        }
    } 
    catch (err) {
    console.error('로그인 에러:', err);
    }
});
