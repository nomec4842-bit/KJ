cmake_minimum_required(VERSION 3.16)
project(KJ LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(KJ_SOURCES
    src/dsp.cpp
    src/main.cpp
)

add_executable(KJ ${KJ_SOURCES})

target_include_directories(KJ PRIVATE src)

if(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
  target_compile_definitions(KJ PRIVATE _CRT_SECURE_NO_WARNINGS)
  target_compile_options(KJ PRIVATE /O2 /EHsc /permissive-)
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
  if(MINGW)
    target_compile_options(KJ PRIVATE -O2 -std=c++20 -Wall)
  endif()
endif()

