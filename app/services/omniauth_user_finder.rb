class OmniauthUserFinder
  attr_reader :auth

  def initialize(auth)
    @auth = auth
  end

  def call
    identity = Identity.find_by(provider: auth.provider, uid: auth.uid)
    return identity.user if identity

    user = find_or_create_user
    user.identities.create!(
      provider: auth.provider,
      uid: auth.uid,
      email: auth_email,
      name: auth_name,
      avatar_url: auth_avatar
    )
    user
  end

  private

  def find_or_create_user
    existing = User.find_by(email: auth_email) if auth_email.present?
    return existing if existing

    User.create!(
      email: auth_email || placeholder_email,
      nickname: auth_name,
      name: auth_name,
      avatar_url: auth_avatar,
      skip_password_validation: true
    )
  end

  def auth_email
    @auth_email ||= auth.info&.email&.downcase&.strip.presence
  end

  def auth_name
    @auth_name ||= auth.info&.name.presence || auth.info&.nickname.presence || "사용자"
  end

  def auth_avatar
    @auth_avatar ||= auth.info&.image
  end

  def placeholder_email
    "#{auth.provider}_#{auth.uid}@placeholder.local"
  end
end
