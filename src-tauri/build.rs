fn main() {
    println!("cargo:rustc-link-arg=/DELAYLOAD:WinDivert.dll");
    println!("cargo:rustc-link-lib=delayimp");
    tauri_build::build()
}
