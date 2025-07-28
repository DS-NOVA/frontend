/*16번 pr과 다른 내용. 회원가입 프로필 설정과 관련된 내용. 추후 해당 이슈로 옮길 예정입니다.*/
/*

const fileInput = document.getElementById("profile-image-input");
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

*/