import obspython as obs
import json
import os

CONFIG_PATH = os.path.join(os.getenv("APPDATA"), "obs-studio", "pc-connect-push.json")


def script_description():
    return "PCConnect 自动推流助手（Python 安全版）\n" \
           "从 PCConnect 读取推流配置，一键开始推流。\n" \
           "可绑定热键：设置 → 热键 → 找到此脚本 → 分配组合键。"


def load_config():
    """读取配置文件，返回 (server, key) 或 (None, None)"""
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        server = data.get("server", "")
        key = data.get("key", "")
        return server, key
    except FileNotFoundError:
        obs.script_log(obs.LOG_WARNING, "配置文件不存在，请先在 PCConnect 中开始共享。")
    except json.JSONDecodeError:
        obs.script_log(obs.LOG_WARNING, "配置文件内容无效，无法解析 JSON。")
    except Exception as e:
        obs.script_log(obs.LOG_WARNING, f"读取配置文件时发生异常: {e}")
    return None, None


def set_streaming_and_start(props=None, prop=None):
    server, key = load_config()
    if not server or not key:
        obs.script_log(obs.LOG_WARNING, "未获取到有效的服务器或密钥，推流未启动。")
        return

    try:
        service = obs.obs_frontend_get_streaming_service()
        if not service:
            obs.script_log(obs.LOG_ERROR, "无法获取 OBS 推流服务。")
            return

        settings = obs.obs_data_create()
        obs.obs_data_set_string(settings, "server", server)
        obs.obs_data_set_string(settings, "key", key)
        obs.obs_data_set_string(settings, "service", "rtmp_custom")

        obs.obs_service_update(service, settings)
        obs.obs_data_release(settings)
        obs.obs_service_release(service)

        if not obs.obs_frontend_streaming_active():
            obs.obs_frontend_streaming_start()
            obs.script_log(obs.LOG_INFO, f"已自动开始推流 → {server}/{key}")
        else:
            obs.script_log(obs.LOG_INFO, "推流已在进行中，配置已更新。")
    except Exception as e:
        obs.script_log(obs.LOG_ERROR, f"设置推流时发生异常: {e}")


def stop_streaming(props=None, prop=None):
    try:
        if obs.obs_frontend_streaming_active():
            obs.obs_frontend_streaming_stop()
            obs.script_log(obs.LOG_INFO, "已停止推流。")
    except Exception as e:
        obs.script_log(obs.LOG_ERROR, f"停止推流时发生异常: {e}")


def script_properties():
    props = obs.obs_properties_create()
    obs.obs_properties_add_button(props, "start_btn", "开始推流（自动配置）", set_streaming_and_start)
    obs.obs_properties_add_button(props, "stop_btn", "停止推流", stop_streaming)
    return props


def script_update(settings):
    pass


def script_defaults(settings):
    pass
