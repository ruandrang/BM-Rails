class ClubMembershipsController < ApplicationController
  include ClubAuthorization

  before_action :set_authorized_club
  before_action :require_club_owner, only: [ :update_role, :transfer_ownership ]
  before_action :require_club_admin, only: [ :destroy ]

  def index
    @memberships = @club.club_memberships.includes(:user).order(:role, :joined_at)
  end

  # PATCH /clubs/:club_id/memberships/:id/update_role
  def update_role
    membership = @club.club_memberships.find(params[:id])
    return redirect_with_alert("본인의 역할은 변경할 수 없습니다.") if membership.user == current_user
    return redirect_with_alert("owner 역할은 양도로만 변경 가능합니다.") if membership.owner?

    new_role = params[:role]
    return redirect_with_alert("유효하지 않은 역할입니다.") unless new_role.in?(%w[admin member])

    membership.update!(role: new_role)
    redirect_to club_memberships_path(@club), notice: "역할이 변경되었습니다."
  end

  # PATCH /clubs/:club_id/memberships/transfer_ownership
  def transfer_ownership
    new_owner_membership = @club.club_memberships.find(params[:membership_id])
    return redirect_with_alert("본인에게는 양도할 수 없습니다.") if new_owner_membership.user == current_user

    ActiveRecord::Base.transaction do
      @current_membership.update!(role: "admin")
      new_owner_membership.update!(role: "owner")
    end
    redirect_to club_memberships_path(@club), notice: "클럽 소유권이 이전되었습니다."
  end

  # DELETE /clubs/:club_id/memberships/:id
  def destroy
    membership = @club.club_memberships.find(params[:id])

    if membership.user == current_user
      # 본인 탈퇴
      return redirect_with_alert("owner는 탈퇴할 수 없습니다. 먼저 소유권을 양도하세요.") if membership.owner?
      membership.destroy
      redirect_to clubs_path, notice: "클럽에서 탈퇴했습니다."
    else
      # 관리자가 추방
      return redirect_with_alert("owner는 추방할 수 없습니다.") if membership.owner?
      membership.destroy
      redirect_to club_memberships_path(@club), notice: "멤버가 추방되었습니다."
    end
  end

  private

  def redirect_with_alert(message)
    redirect_to club_memberships_path(@club), alert: message
  end
end
