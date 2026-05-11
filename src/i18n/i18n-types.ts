import type { BaseTranslation as BaseTranslationType, LocalizedString } from 'typesafe-i18n'

export type BaseTranslation = BaseTranslationType
export type BaseLocale = 'zh'

export type Locales = 'zh'

export type Translation = RootTranslation

export type Translations = RootTranslation

type RootTranslation = {
  about: string
  advanced: string
  basic: string
  cancel: string
  choose_a_color: string
  code_of_conduct: string
  color: string
  connect: string
  connection_established: string
  copy_my_connection_string: string
  disconnect: string
  fullscreen: string
  host_a_session: string
  host_connection_string: string
  hosting_a_session: string
  is_microphone_active_on_connect: string
  join_a_session: string
  joined_a_session: string
  language: string
  language_description: string
  media: string
  microphone_active: string
  microphone_inactive: string
  not_streaming_your_display: string
  participant_connection_string: string
  privacty_policy: string
  remote_cursors_disabled: string
  remote_cursors_enabled: string
  remote_screen: string
  report_a_bug: string
  save: string
  see_the_code: string
  session_started: string
  settings: string
  shoulders_of_giants: string
  shoulders_of_giants_description: string
  start_a_new_session: string
  streaming_your_display: string
  stun_turn_server_objects: string
  terms_of_service: string
  username: string
  website: string
  zoom_in: string
  zoom_out: string
}

export type TranslationFunctions = {
  about: () => LocalizedString
  advanced: () => LocalizedString
  basic: () => LocalizedString
  cancel: () => LocalizedString
  choose_a_color: () => LocalizedString
  code_of_conduct: () => LocalizedString
  color: () => LocalizedString
  connect: () => LocalizedString
  connection_established: () => LocalizedString
  copy_my_connection_string: () => LocalizedString
  disconnect: () => LocalizedString
  fullscreen: () => LocalizedString
  host_a_session: () => LocalizedString
  host_connection_string: () => LocalizedString
  hosting_a_session: () => LocalizedString
  is_microphone_active_on_connect: () => LocalizedString
  join_a_session: () => LocalizedString
  joined_a_session: () => LocalizedString
  language: () => LocalizedString
  language_description: () => LocalizedString
  media: () => LocalizedString
  microphone_active: () => LocalizedString
  microphone_inactive: () => LocalizedString
  not_streaming_your_display: () => LocalizedString
  participant_connection_string: () => LocalizedString
  privacty_policy: () => LocalizedString
  remote_cursors_disabled: () => LocalizedString
  remote_cursors_enabled: () => LocalizedString
  remote_screen: () => LocalizedString
  report_a_bug: () => LocalizedString
  save: () => LocalizedString
  see_the_code: () => LocalizedString
  session_started: () => LocalizedString
  settings: () => LocalizedString
  shoulders_of_giants: () => LocalizedString
  shoulders_of_giants_description: () => LocalizedString
  start_a_new_session: () => LocalizedString
  streaming_your_display: () => LocalizedString
  stun_turn_server_objects: () => LocalizedString
  terms_of_service: () => LocalizedString
  username: () => LocalizedString
  website: () => LocalizedString
  zoom_in: () => LocalizedString
  zoom_out: () => LocalizedString
}

export type Formatters = {}
